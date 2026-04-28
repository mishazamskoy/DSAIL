import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls, Sky } from '@react-three/drei'
import { supabase } from '../lib/supabase'
import {
  createInitialMap, GRID_SIZE, CELL,
  CASTLE_ROW, CASTLE_COL, CASTLE_SPAN, grassShade,
} from '../game/mapData'

// Baseline map — used to distinguish original roads from user-placed ones
const ORIGINAL_MAP = createInitialMap()

// ─── Game data ────────────────────────────────────────────────────────────────

const STRUCTURES = [
  {
    id: 'granary',
    name: 'Granary',
    emoji: '🌾',
    renderIcon: () => <GranaryIcon />,
    desc: 'Stores food for your growing city.',
    cost: { wood: 20, food: 0, knowledge: 0 },
    generates: [{ icon: '🌾', value: 10, label: 'grain' }],
  },
  {
    id: 'market',
    name: 'Market',
    emoji: '🏪',
    renderIcon: () => <MarketIcon />,
    desc: 'A bustling market that drives trade.',
    cost: { food: 20, wood: 0, knowledge: 0 },
    generates: [{ icon: '💰', value: 10, label: 'money' }],
  },
  {
    id: 'house',
    name: 'House',
    emoji: '🏠',
    renderIcon: () => <HouseIcon />,
    desc: 'A medieval home with a backyard farm.',
    cost: { wood: 20, food: 0, knowledge: 0 },
    generates: [{ icon: '👥', value: 4, label: 'population' }],
  },
]

const GRASS_HEX = ['#166534', '#15803d', '#14532d']

// Lane indices: 1..16 (the cells directly adjacent to each wall side)
const LANE = Array.from({ length: GRID_SIZE - 2 }, (_, i) => i + 1) // [1..16]
const LAST  = GRID_SIZE - 1 // 17

/**
 * When an entire lane outside a wall side is purchased, move that wall outward.
 * Only WALL→EMPTY and GRASS/EMPTY→WALL conversions are made; roads etc. are untouched.
 */
function applyWallExpansions(map, purchasedTerritory) {
  const topDone    = LANE.every(c => purchasedTerritory.has(`0,${c}`))
  const bottomDone = LANE.every(c => purchasedTerritory.has(`${LAST},${c}`))
  const leftDone   = LANE.every(r => purchasedTerritory.has(`${r},0`))
  const rightDone  = LANE.every(r => purchasedTerritory.has(`${r},${LAST}`))

  if (!topDone && !bottomDone && !leftDone && !rightDone) return map

  const next = map.map(row => row.map(cell => ({ ...cell })))

  if (topDone) {
    LANE.forEach(c => { next[0][c].type = CELL.WALL })
    LANE.forEach(c => { if (next[1][c].type === CELL.WALL) next[1][c].type = CELL.EMPTY })
    if (!leftDone)  next[1][1].type  = CELL.WALL   // keep corner until left expands
    if (!rightDone) next[1][LAST - 1].type = CELL.WALL
  }
  if (bottomDone) {
    LANE.forEach(c => { next[LAST][c].type = CELL.WALL })
    // Carry the gate opening (ROAD cells in old south wall) into the new wall row
    LANE.forEach(c => { if (next[LAST - 1][c].type === CELL.ROAD) next[LAST][c].type = CELL.ROAD })
    LANE.forEach(c => { if (next[LAST - 1][c].type === CELL.WALL) next[LAST - 1][c].type = CELL.EMPTY })
    if (!leftDone)  next[LAST - 1][1].type  = CELL.WALL
    if (!rightDone) next[LAST - 1][LAST - 1].type = CELL.WALL
  }
  if (leftDone) {
    LANE.forEach(r => { next[r][0].type = CELL.WALL })
    LANE.forEach(r => { if (next[r][1].type === CELL.WALL) next[r][1].type = CELL.EMPTY })
    if (!topDone)    next[1][1].type  = CELL.WALL
    if (!bottomDone) next[LAST - 1][1].type = CELL.WALL
  }
  if (rightDone) {
    LANE.forEach(r => { next[r][LAST].type = CELL.WALL })
    LANE.forEach(r => { if (next[r][LAST - 1].type === CELL.WALL) next[r][LAST - 1].type = CELL.EMPTY })
    if (!topDone)    next[1][LAST - 1].type  = CELL.WALL
    if (!bottomDone) next[LAST - 1][LAST - 1].type = CELL.WALL
  }

  // Fill outer corners when both adjacent sides expand
  if (topDone && leftDone)     next[0][0].type        = CELL.WALL
  if (topDone && rightDone)    next[0][LAST].type     = CELL.WALL
  if (bottomDone && leftDone)  next[LAST][0].type     = CELL.WALL
  if (bottomDone && rightDone) next[LAST][LAST].type  = CELL.WALL

  return next
}

// cell (r, c) → world [x, y, z] center at ground level
function cellWorld(r, c) { return [c - 8.5, 0, r - 8.5] }

// Centre of a 2×2 footprint whose top-left is (r, c)
function footprintCenter(r, c) { return [c - 8, 0, r - 8] }

// If (r,c) falls inside any built structure's 2×2 footprint, return { structId, key }
// A structure with top-left (sr,sc) covers (sr,sc),(sr,sc+1),(sr+1,sc),(sr+1,sc+1)
// So (r,c) is covered if there's a structure at any of (r,c),(r-1,c),(r,c-1),(r-1,c-1)
function getOccupant(r, c, builtStructures) {
  for (const dr of [0, 1]) {
    for (const dc of [0, 1]) {
      const key = `${r - dr},${c - dc}`
      const structId = builtStructures[key]
      if (structId) return { structId, key }
    }
  }
  return undefined
}

// ─── Ground tile ───────────────────────────────────────────────────────────────

function GroundTile({ cell, builtId, selected, isValidBuild, isPickedUp, purchasable, onCellClick, onCellHover }) {
  const r = cell._r, c = cell._c
  const [wx, , wz] = cellWorld(r, c)

  const isDemolishMode = selected === 'demolish'
  const isMoveMode     = selected === 'move'
  const isDemolishable = isDemolishMode && (!!builtId || cell.type === CELL.ROAD)
  const isBuildMode    = !!selected && !['road', 'demolish', 'expand', 'move'].includes(selected)

  let color, height, emissive = '#000000', emissiveIntensity = 0

  switch (cell.type) {
    case CELL.GRASS:
      color = GRASS_HEX[grassShade(r, c)]; height = 0.12
      if (purchasable) { emissive = '#d97706'; emissiveIntensity = 0.45 }
      break
    case CELL.WALL:
      color = '#9ca3af'; height = 2.0; break
    case CELL.EMPTY:
      if (builtId) {
        color = '#78350f'; height = 0.12
        if (isDemolishable)                { emissive = '#ef4444'; emissiveIntensity = 0.6  }
        else if (isMoveMode && isPickedUp) { emissive = '#f97316'; emissiveIntensity = 0.65 }
        else if (isMoveMode)               { emissive = '#06b6d4'; emissiveIntensity = 0.45 }
      } else if (isMoveMode && isValidBuild) {
        color = '#14532d'; height = 0.18
        emissive = '#16a34a'; emissiveIntensity = 0.4
      } else if (isBuildMode && isValidBuild) {
        color = '#fbbf24'; height = 0.18
        emissive = '#d97706'; emissiveIntensity = 0.25
      } else {
        color = '#c8a97e'; height = 0.12
      }
      break
    case CELL.ROAD:
      color = '#57534e'; height = 0.14
      if (isDemolishable) { emissive = '#7f1d1d'; emissiveIntensity = 0.5 }
      break
    case CELL.CASTLE:
      color = '#334155'; height = 0.12; break
    default:
      color = '#15803d'; height = 0.12
  }

  const clickable =
    (cell.type === CELL.EMPTY && !builtId && isBuildMode && isValidBuild) ||
    (cell.type === CELL.EMPTY && !builtId && selected === 'road') ||
    isDemolishable ||
    (selected === 'expand' && purchasable) ||
    (isMoveMode && !!builtId) ||
    (isMoveMode && !builtId && isValidBuild)

  return (
    <mesh
      position={[wx, height / 2, wz]}
      onClick={clickable ? e => { e.stopPropagation(); onCellClick(r, c) } : undefined}
      onPointerEnter={e => {
        e.stopPropagation()
        onCellHover(r, c)
        if (clickable) e.object.material.emissiveIntensity = emissiveIntensity + 0.3
      }}
      onPointerLeave={clickable ? e => { e.object.material.emissiveIntensity = emissiveIntensity } : undefined}
    >
      <boxGeometry args={[0.97, height, 0.97]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        roughness={cell.type === CELL.GRASS ? 0.95 : 0.75}
      />
    </mesh>
  )
}

// ─── Ghost footprint (move mode placement preview) ────────────────────────────

function GhostFootprint({ r, c, isValid }) {
  if (r + 1 >= GRID_SIZE || c + 1 >= GRID_SIZE) return null
  const color = isValid ? '#4ade80' : '#9ca3af'
  return (
    <>
      {[[r,c],[r,c+1],[r+1,c],[r+1,c+1]].map(([tr, tc]) => {
        const [wx, , wz] = cellWorld(tr, tc)
        return (
          <mesh key={`ghost-${tr}-${tc}`} position={[wx, 0.32, wz]}>
            <boxGeometry args={[0.97, 0.28, 0.97]} />
            <meshStandardMaterial
              color={color}
              transparent
              opacity={0.48}
              depthWrite={false}
            />
          </mesh>
        )
      })}
    </>
  )
}

// ─── Surrounding grass tiles ──────────────────────────────────────────────────

const GRASS_PADDING = 30

function SurroundingGrass() {
  const ref = useRef()

  const instances = useMemo(() => {
    const list = []
    const rMin = -GRASS_PADDING
    const rMax = GRID_SIZE + GRASS_PADDING - 1
    for (let r = rMin; r <= rMax; r++) {
      for (let c = rMin; c <= rMax; c++) {
        if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) continue
        list.push([c - 8.5, r - 8.5, grassShade(r, c)])
      }
    }
    return list
  }, [])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const mat = new THREE.Matrix4()
    const col = new THREE.Color()
    instances.forEach(([wx, wz, shade], i) => {
      mat.makeTranslation(wx, 0.06, wz)
      mesh.setMatrixAt(i, mat)
      mesh.setColorAt(i, col.set(GRASS_HEX[shade]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [instances])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, instances.length]} receiveShadow>
      <boxGeometry args={[0.97, 0.12, 0.97]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  )
}

// ─── Ocean ─────────────────────────────────────────────────────────────────────

function Ocean() {
  const surface = useRef()
  const deep     = useRef()

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (surface.current) {
      surface.current.position.y = Math.sin(t * 0.4) * 0.035
      surface.current.rotation.z = Math.sin(t * 0.18) * 0.003
    }
    if (deep.current) {
      deep.current.position.y = Math.sin(t * 0.4 + 1.2) * 0.018 - 0.12
    }
  })

  return (
    <group>
      {/* Deep ocean floor — absorbs all light */}
      <mesh ref={deep} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#061a2e" roughness={1} />
      </mesh>

      {/* Surface layer — slightly reflective, gently animated */}
      <mesh ref={surface} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[600, 600, 64, 64]} />
        <meshStandardMaterial
          color="#0e6b96"
          roughness={0.15}
          metalness={0.25}
          transparent
          opacity={0.92}
        />
      </mesh>
    </group>
  )
}

// ─── Castle 3D ────────────────────────────────────────────────────────────────
// Centered at world (0, 0, 0) — matches CASTLE_ROW=7, CASTLE_COL=7, CASTLE_SPAN=4
// World X/Z both run from -2 to +2 for castle footprint.

function Block({ pos, size, color, roughness = 0.8, metalness = 0 }) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  )
}

function Castle3D() {
  const STONE      = '#f0ece4'
  const DARK       = '#d6cfc4'
  const LIGHT      = '#ffffff'
  const VERY_DARK  = '#1a1208'

  // Tower positions (XZ) — at the corners of the 4×4 footprint
  const towerXZs = [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]]

  return (
    <group position={[0, 0, 0]}>
      {/* Foundation slab */}
      <Block pos={[0, 0.07, 0]} size={[3.9, 0.14, 3.9]} color={DARK} />

      {/* Main keep */}
      <Block pos={[0, 1.85, 0]} size={[2.2, 3.7, 2.2]} color={STONE} />

      {/* Keep roof cap */}
      <Block pos={[0, 3.78, 0]} size={[2.4, 0.16, 2.4]} color={DARK} />

      {/* Keep merlons (top crenellations) */}
      {[
        [-0.75, -1.12], [0, -1.12], [0.75, -1.12],
        [-0.75,  1.12], [0,  1.12], [0.75,  1.12],
        [-1.12, -0.38], [-1.12, 0.38],
        [ 1.12, -0.38], [ 1.12, 0.38],
      ].map(([mx, mz], i) => (
        <Block key={`km${i}`} pos={[mx, 4.13, mz]} size={[0.28, 0.5, 0.28]} color={LIGHT} />
      ))}

      {/* Corner towers */}
      {towerXZs.map(([tx, tz], i) => (
        <group key={`t${i}`}>
          <Block pos={[tx, 2.35, tz]} size={[1.05, 4.7, 1.05]} color={DARK} />
          {/* Tower ring cap */}
          <Block pos={[tx, 4.78, tz]} size={[1.18, 0.18, 1.18]} color={STONE} />
          {/* Tower merlons */}
          {[[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].map(([bx, bz], j) => (
            <Block key={`tm${i}${j}`} pos={[tx + bx, 5.08, tz + bz]} size={[0.22, 0.5, 0.22]} color={LIGHT} />
          ))}
          {/* Arrow slit — face inward toward keep */}
          <Block
            pos={[tx + (tx < 0 ? 0.53 : -0.53), 1.6, tz]}
            size={[0.06, 0.45, 0.18]}
            color={VERY_DARK}
          />
        </group>
      ))}

      {/* Keep windows */}
      <Block pos={[ 0.55, 2.0, -1.11]} size={[0.28, 0.45, 0.07]} color={VERY_DARK} />
      <Block pos={[-0.55, 2.0, -1.11]} size={[0.28, 0.45, 0.07]} color={VERY_DARK} />
      <Block pos={[ 0.55, 2.0,  1.11]} size={[0.28, 0.45, 0.07]} color={VERY_DARK} />
      <Block pos={[-0.55, 2.0,  1.11]} size={[0.28, 0.45, 0.07]} color={VERY_DARK} />

      {/* Gate (south face, z = -1.1) */}
      <Block pos={[0, 0.85, -1.12]} size={[0.75, 1.6, 0.08]} color={VERY_DARK} />
      {/* Gate arch cap */}
      <Block pos={[0, 1.72, -1.12]} size={[0.75, 0.28, 0.08]} color={VERY_DARK} />

      {/* Flag pole */}
      <mesh position={[0, 4.1, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 1.9, 8]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Flag */}
      <Block pos={[0.48, 4.9, 0]} size={[0.95, 0.5, 0.05]} color="#dc2626" roughness={0.6} />
    </group>
  )
}

// ─── Granary 3D ───────────────────────────────────────────────────────────────

function Granary3D({ cx, cz }) {
  const WALL   = '#f5f0e8'  // white walls
  const ROOF   = '#78350f'  // brown roof
  const DOOR   = '#92400e'  // brown door
  const WINDOW = '#1e293b'  // dark window glass
  const BASE   = '#d6cfc4'  // stone foundation

  return (
    <group position={[cx, 0, cz]}>
      {/* Foundation slab */}
      <mesh position={[0, 0.07, 0]} receiveShadow>
        <boxGeometry args={[1.88, 0.14, 1.88]} />
        <meshStandardMaterial color={BASE} roughness={0.9} />
      </mesh>

      {/* White walls */}
      <mesh position={[0, 0.79, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.62, 1.32, 1.62]} />
        <meshStandardMaterial color={WALL} roughness={0.75} />
      </mesh>

      {/* Brown pyramid roof */}
      <mesh position={[0, 1.73, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.24, 0.88, 4]} />
        <meshStandardMaterial color={ROOF} roughness={0.8} />
      </mesh>

      {/* Roof overhang trim */}
      <mesh position={[0, 1.29, 0]} castShadow>
        <boxGeometry args={[1.74, 0.08, 1.74]} />
        <meshStandardMaterial color={ROOF} roughness={0.8} />
      </mesh>

      {/* Brown door */}
      <mesh position={[0, 0.48, 0.82]}>
        <boxGeometry args={[0.38, 0.66, 0.07]} />
        <meshStandardMaterial color={DOOR} roughness={0.8} />
      </mesh>
      {/* Door frame */}
      <mesh position={[0, 0.48, 0.815]}>
        <boxGeometry args={[0.46, 0.74, 0.05]} />
        <meshStandardMaterial color={BASE} roughness={0.85} />
      </mesh>
      {/* Door (on top of frame) */}
      <mesh position={[0, 0.48, 0.825]}>
        <boxGeometry args={[0.38, 0.66, 0.05]} />
        <meshStandardMaterial color={DOOR} roughness={0.8} />
      </mesh>

      {/* Front windows */}
      {[-0.48, 0.48].map(ox => (
        <mesh key={ox} position={[ox, 0.92, 0.822]}>
          <boxGeometry args={[0.24, 0.24, 0.06]} />
          <meshStandardMaterial color={WINDOW} roughness={0.3} metalness={0.1} />
        </mesh>
      ))}

      {/* Side windows */}
      {[-0.48, 0.48].map(oz => (
        <mesh key={oz} position={[0.822, 0.92, oz]}>
          <boxGeometry args={[0.06, 0.24, 0.24]} />
          <meshStandardMaterial color={WINDOW} roughness={0.3} metalness={0.1} />
        </mesh>
      ))}
    </group>
  )
}

// ─── Market 3D ────────────────────────────────────────────────────────────────
// Open-air market stall: canopy over a produce-laden counter, back storage wall

function Market3D({ cx, cz }) {
  const WOOD     = '#92400e'
  const WOOD_LT  = '#b45309'
  const CANOPY_R = '#dc2626'  // red stripe
  const CANOPY_W = '#fef9c3'  // cream stripe
  const BASE     = '#d6cfc4'

  return (
    <group position={[cx, 0, cz]}>
      {/* Stone base */}
      <Block pos={[0, 0.07, 0]} size={[1.9, 0.14, 1.9]} color={BASE} roughness={0.9} />

      {/* ── Back storage wall ── */}
      <Block pos={[0, 0.7, -0.72]} size={[1.7, 1.26, 0.14]} color={WOOD_LT} roughness={0.85} />

      {/* Back shelf */}
      <Block pos={[0, 0.88, -0.64]} size={[1.5, 0.07, 0.2]} color={WOOD} roughness={0.8} />
      {/* Shelf items: small crates / pots */}
      {[-0.55, -0.22, 0.12, 0.45].map((ox, i) => (
        <Block key={`crate${i}`} pos={[ox, 0.98, -0.62]} size={[0.22, 0.17, 0.16]}
          color={i % 2 === 0 ? '#78350f' : '#a16207'} roughness={0.85} />
      ))}

      {/* ── Four support posts ── */}
      {[-0.68, 0.68].map(ox =>
        [-0.55, 0.62].map(oz => (
          <mesh key={`${ox}-${oz}`} position={[ox, 0.65, oz]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 1.16, 7]} />
            <meshStandardMaterial color={WOOD} roughness={0.8} />
          </mesh>
        ))
      )}

      {/* ── Red-and-cream striped canopy ── */}
      {[-0.6, -0.2, 0.2, 0.6].map((ox, i) => (
        <Block key={`can${i}`} pos={[ox, 1.25, 0.04]}
          size={[0.38, 0.07, 1.4]}
          color={i % 2 === 0 ? CANOPY_R : CANOPY_W} roughness={0.65} />
      ))}
      {/* Canopy front valance (scalloped suggestion) */}
      <Block pos={[0, 1.2, 0.76]} size={[1.56, 0.12, 0.06]} color={CANOPY_R} roughness={0.65} />
      {[-0.52, -0.17, 0.17, 0.52].map((ox, i) => (
        <Block key={`val${i}`} pos={[ox, 1.14, 0.76]} size={[0.22, 0.12, 0.06]}
          color={i % 2 === 0 ? CANOPY_R : CANOPY_W} roughness={0.65} />
      ))}

      {/* ── Counter ── */}
      <Block pos={[0, 0.58, 0.55]} size={[1.5, 0.1, 0.44]} color={WOOD} roughness={0.8} />  {/* top */}
      <Block pos={[0, 0.29, 0.55]} size={[1.5, 0.46, 0.1]} color={WOOD_LT} roughness={0.85} /> {/* face */}
      {/* Counter legs */}
      {[-0.64, 0.64].map(ox => (
        <Block key={`leg${ox}`} pos={[ox, 0.29, 0.52]} size={[0.1, 0.46, 0.38]} color={WOOD} roughness={0.8} />
      ))}

      {/* ── Produce on counter ── */}
      {/* Red apples */}
      {[-0.62, -0.44].map((ox, i) => (
        <mesh key={`apple${i}`} position={[ox, 0.69, 0.52]} castShadow>
          <sphereGeometry args={[0.095, 8, 6]} />
          <meshStandardMaterial color="#dc2626" roughness={0.55} />
        </mesh>
      ))}
      {/* Oranges */}
      {[-0.18, 0.0].map((ox, i) => (
        <mesh key={`orange${i}`} position={[ox, 0.69, 0.52]} castShadow>
          <sphereGeometry args={[0.095, 8, 6]} />
          <meshStandardMaterial color="#f97316" roughness={0.55} />
        </mesh>
      ))}
      {/* Yellow lemons */}
      {[0.22, 0.38].map((ox, i) => (
        <mesh key={`lemon${i}`} position={[ox, 0.68, 0.52]} castShadow>
          <sphereGeometry args={[0.08, 8, 6]} />
          <meshStandardMaterial color="#eab308" roughness={0.55} />
        </mesh>
      ))}
      {/* Purple grapes cluster */}
      {[0.6, 0.68, 0.64].map((ox, i) => (
        <mesh key={`grape${i}`} position={[ox, 0.66 + i * 0.04, 0.5 + (i % 2) * 0.06]} castShadow>
          <sphereGeometry args={[0.07, 7, 6]} />
          <meshStandardMaterial color="#7c3aed" roughness={0.5} />
        </mesh>
      ))}
      {/* Meat slab (pink-red) */}
      <Block pos={[-0.62, 0.645, 0.62]} size={[0.24, 0.07, 0.16]} color="#db2777" roughness={0.65} />
      {/* Second meat cut */}
      <Block pos={[-0.34, 0.645, 0.62]} size={[0.2, 0.07, 0.14]} color="#be123c" roughness={0.65} />
    </group>
  )
}

// ─── House 3D ─────────────────────────────────────────────────────────────────
// Medieval half-timbered house (front) + fenced backyard farm (rear)

function House3D({ cx, cz }) {
  const PLASTER = '#ede8de'   // cream plaster
  const TIMBER  = '#2d1a0a'   // very dark brown beams
  const ROOF    = '#3b2a1e'   // dark roof tiles
  const CHIMNEY = '#9ca3af'   // stone
  const DOOR    = '#78350f'   // brown door
  const GLASS   = '#1e293b'   // window glass
  const SOIL    = '#713f12'   // farm soil
  const CROP    = '#16a34a'   // crop shoots
  const FENCE   = '#b45309'   // fence wood
  const BASE    = '#d6cfc4'   // foundation stone

  // House: 1.3 wide × 0.85 deep, centered at z=+0.18 → front face at z=+0.605, back at z=−0.245
  // Farm:  behind house,  z = −0.38 to −0.85
  // Fence: z = −0.30

  const HZ = 0.18   // house centre z
  const HW = 1.3    // house width
  const HD = 0.85   // house depth
  const WH = 0.92   // wall height (y: 0.14 → 1.06)
  const FZ = HZ + HD / 2  // front face z = 0.605

  return (
    <group position={[cx, 0, cz]}>
      {/* Stone foundation */}
      <Block pos={[0, 0.07, 0]} size={[1.88, 0.14, 1.88]} color={BASE} roughness={0.95} />

      {/* ── Plaster walls ── */}
      <Block pos={[0, 0.14 + WH / 2, HZ]} size={[HW, WH, HD]} color={PLASTER} roughness={0.78} />

      {/* ── Timber frame on front face ── */}
      {/* Horizontal rails */}
      {[0.17, 0.65, 1.04].map((y, i) => (
        <Block key={`hf${i}`} pos={[0, y, FZ + 0.01]} size={[HW, 0.065, 0.055]} color={TIMBER} roughness={0.85} />
      ))}
      {/* Vertical studs */}
      {[-0.54, -0.05, 0.44].map((ox, i) => (
        <Block key={`vf${i}`} pos={[ox, 0.14 + WH / 2, FZ + 0.01]} size={[0.065, WH, 0.055]} color={TIMBER} roughness={0.85} />
      ))}
      {/* Diagonal brace (top-left panel) */}
      <mesh position={[-0.295, 0.855, FZ + 0.015]} rotation={[0, 0, -Math.PI / 4]} castShadow>
        <boxGeometry args={[0.065, 0.42, 0.05]} />
        <meshStandardMaterial color={TIMBER} roughness={0.85} />
      </mesh>

      {/* ── Timber frame on side faces (x = ±0.65) ── */}
      {[1, -1].map(s => (
        <Block key={`hs${s}`} pos={[s * 0.651, 0.65, HZ]} size={[0.055, WH, HD]} color={TIMBER} roughness={0.85} />
      ))}

      {/* ── Pyramid roof ── */}
      <mesh position={[0, 1.06 + 0.38, HZ]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.82, 0.76, 4]} />
        <meshStandardMaterial color={ROOF} roughness={0.88} />
      </mesh>
      {/* Eave trim */}
      <Block pos={[0, 1.08, HZ]} size={[HW + 0.14, 0.08, HD + 0.14]} color={TIMBER} roughness={0.85} />

      {/* ── Chimney ── */}
      <Block pos={[0.34, 1.50, HZ - 0.1]} size={[0.19, 0.92, 0.19]} color={CHIMNEY} roughness={0.92} />
      <Block pos={[0.34, 1.98, HZ - 0.1]} size={[0.25, 0.09, 0.25]} color="#6b7280" roughness={0.9} />

      {/* ── Door ── */}
      <Block pos={[-0.05, 0.47, FZ + 0.015]} size={[0.3, 0.66, 0.07]} color={DOOR} roughness={0.8} />

      {/* ── Front windows ── */}
      {[-0.44, 0.4].map((ox, i) => (
        <Block key={`w${i}`} pos={[ox, 0.74, FZ + 0.015]} size={[0.24, 0.26, 0.06]}
          color={GLASS} roughness={0.3} metalness={0.1} />
      ))}

      {/* ── Fence (separates house yard from farm) ── */}
      {[-0.68, -0.23, 0.23, 0.68].map((ox, i) => (
        <mesh key={`fp${i}`} position={[ox, 0.3, -0.30]} castShadow>
          <cylinderGeometry args={[0.042, 0.042, 0.36, 6]} />
          <meshStandardMaterial color={FENCE} roughness={0.85} />
        </mesh>
      ))}
      <Block pos={[0, 0.37, -0.30]} size={[1.44, 0.065, 0.05]} color={FENCE} roughness={0.85} />
      <Block pos={[0, 0.24, -0.30]} size={[1.44, 0.065, 0.05]} color={FENCE} roughness={0.85} />

      {/* ── Farm soil plots ── */}
      {[-0.46, 0.46].map((ox, i) => (
        <Block key={`soil${i}`} pos={[ox, 0.17, -0.60]} size={[0.56, 0.08, 0.48]} color={SOIL} roughness={0.97} />
      ))}

      {/* ── Crop shoots on each plot ── */}
      {[-0.46, 0.46].map((ox) =>
        [-0.82, -0.66, -0.50, -0.38].map((oz, j) =>
          [-0.16, 0, 0.16].map((dx, k) => (
            <mesh key={`${ox}-${oz}-${dx}`} position={[ox + dx, 0.30, oz]}>
              <boxGeometry args={[0.065, 0.18, 0.065]} />
              <meshStandardMaterial color={k === 1 ? '#15803d' : CROP} roughness={0.8} />
            </mesh>
          ))
        )
      )}
    </group>
  )
}

// ─── City Gate 3D ─────────────────────────────────────────────────────────────
// Positioned at the south wall opening: row 16 → world z = 7.5, cols 8-9 center → x = 0
// Towers sit on wall tiles at cols 7 (x=-1.5) and 10 (x=1.5)

function CityGate3D({ gateZ = 7.5 }) {
  const STONE = '#9ca3af'  // matches city wall tiles
  const DARK  = '#6b7280'
  const VOID  = '#0f172a'
  const GATE_DOOR = '#78350f'

  return (
    <group position={[0, 0, gateZ]}>
      {/* ── Left tower ── */}
      <Block pos={[-1.5, 1.75, 0]} size={[0.92, 3.5, 0.92]} color={STONE} roughness={0.9} />
      <Block pos={[-1.5, 3.58, 0]} size={[1.05, 0.18, 1.05]} color={DARK} />
      {[[-0.28,-0.28],[0.28,-0.28],[-0.28,0.28],[0.28,0.28]].map(([bx,bz],i) => (
        <Block key={`ltm${i}`} pos={[-1.5+bx, 3.85, bz]} size={[0.2,0.44,0.2]} color={STONE} />
      ))}
      {/* Arrow slit facing outward (south) */}
      <Block pos={[-1.5, 1.9, 0.47]} size={[0.15, 0.48, 0.06]} color={VOID} />

      {/* ── Right tower ── */}
      <Block pos={[1.5, 1.75, 0]} size={[0.92, 3.5, 0.92]} color={STONE} roughness={0.9} />
      <Block pos={[1.5, 3.58, 0]} size={[1.05, 0.18, 1.05]} color={DARK} />
      {[[-0.28,-0.28],[0.28,-0.28],[-0.28,0.28],[0.28,0.28]].map(([bx,bz],i) => (
        <Block key={`rtm${i}`} pos={[1.5+bx, 3.85, bz]} size={[0.2,0.44,0.2]} color={STONE} />
      ))}
      <Block pos={[1.5, 1.9, 0.47]} size={[0.15, 0.48, 0.06]} color={VOID} />

      {/* ── Wall spurs bridging towers to arch pillars ── */}
      <Block pos={[-1.0, 1.0, 0]} size={[0.18, 2.0, 0.82]} color={STONE} roughness={0.9} />
      <Block pos={[ 1.0, 1.0, 0]} size={[0.18, 2.0, 0.82]} color={STONE} roughness={0.9} />

      {/* ── Arch pillars (dark stone framing the passage) ── */}
      <Block pos={[-0.64, 1.0, 0]} size={[0.28, 2.0, 0.82]} color={DARK} roughness={0.85} />
      <Block pos={[ 0.64, 1.0, 0]} size={[0.28, 2.0, 0.82]} color={DARK} roughness={0.85} />

      {/* ── Lintel spanning the arch ── */}
      <Block pos={[0, 2.14, 0]} size={[1.56, 0.28, 0.82]} color={DARK} roughness={0.85} />

      {/* ── Solid wall above arch, below battlements ── */}
      <Block pos={[0, 2.79, 0]} size={[1.56, 0.94, 0.82]} color={STONE} roughness={0.9} />

      {/* ── Battlements on top of arch section ── */}
      {[-0.52, -0.17, 0.17, 0.52].map((bx, i) => (
        <Block key={`bm${i}`} pos={[bx, 3.38, 0]} size={[0.22, 0.44, 0.82]} color={STONE} />
      ))}

      {/* ── Gate door (brown wood) ── */}
      <Block pos={[0, 1.0, 0]} size={[1.0, 2.0, 0.84]} color={GATE_DOOR} roughness={0.85} />
    </group>
  )
}

// ─── 3D scene ─────────────────────────────────────────────────────────────────

function GameScene({ map, builtStructures, selected, movingStructure, purchasedTerritory, onCellClick }) {
  // South wall Z: row 16 → 7.5 normally; row 17 → 8.5 when bottom lane complete
  const gateZ = useMemo(
    () => LANE.every(c => purchasedTerritory.has(`${LAST},${c}`)) ? 8.5 : 7.5,
    [purchasedTerritory]
  )

  // Valid top-left positions for a 2×2 structure placement or move drop target
  const validBuildCells = useMemo(() => {
    if (!selected || ['road', 'demolish', 'expand'].includes(selected)) return null
    // In move mode, only show drop targets once a structure is picked up
    if (selected === 'move' && !movingStructure) return null

    let fromFootprint = null
    if (movingStructure) {
      const [fr, fc] = movingStructure.fromKey.split(',').map(Number)
      fromFootprint = new Set([
        `${fr},${fc}`, `${fr},${fc+1}`, `${fr+1},${fc}`, `${fr+1},${fc+1}`
      ])
    }

    const set = new Set()
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        const ok = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]].every(([tr,tc]) => {
          if (map[tr][tc].type !== CELL.EMPTY) return false
          const occ = getOccupant(tr, tc, builtStructures)
          return !occ || (fromFootprint && fromFootprint.has(`${tr},${tc}`))
        })
        if (ok) set.add(`${r},${c}`)
      }
    }
    return set
  }, [selected, map, builtStructures, movingStructure])

  const pickedUpCells = useMemo(() => {
    if (!movingStructure) return null
    const [fr, fc] = movingStructure.fromKey.split(',').map(Number)
    return new Set([`${fr},${fc}`, `${fr},${fc+1}`, `${fr+1},${fc}`, `${fr+1},${fc+1}`])
  }, [movingStructure])

  const [hoverCell, setHoverCell] = useState(null)
  const onCellHover = useCallback((r, c) => setHoverCell({ r, c }), [])

  const purchasableCells = useMemo(() => {
    if (selected !== 'expand') return null
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]]
    const set = new Set()
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (map[r][c].type !== CELL.GRASS) continue
        const adj = dirs.some(([dr, dc]) => {
          const nr = r + dr, nc = c + dc
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return false
          const nt = map[nr][nc].type
          return nt === CELL.WALL || nt === CELL.EMPTY || nt === CELL.ROAD
        })
        if (adj) set.add(`${r},${c}`)
      }
    }
    return set
  }, [selected, map])

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[10, 16, 8]}
        intensity={1.0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.1}
        shadow-camera-far={60}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      {/* Soft fill light from opposite side */}
      <directionalLight position={[-8, 6, -10]} intensity={0.25} color="#a5c8f0" />

      <Sky sunPosition={[60, 10, -80]} turbidity={8} rayleigh={2.5} mieCoefficient={0.003} mieDirectionalG={0.85} />

      <OrbitControls
        target={[0, 0, 0]}
        minPolarAngle={Math.PI / 10}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={6}
        maxDistance={35}
        enableDamping
        dampingFactor={0.08}
      />

      {/* Ocean fills everything beyond the grass island */}
      <Ocean />

      {/* Surrounding grass tiles — island around the city walls */}
      <SurroundingGrass />

      {/* Fog color matches the deep ocean so the horizon blends naturally */}
      <fog attach="fog" args={['#061a2e', 30, 65]} />
      <color attach="background" args={['#061a2e']} />

      {/* All ground tiles */}
      {map.map((row, r) =>
        row.map((cell, c) => (
          <GroundTile
            key={`${r}-${c}`}
            cell={cell}
            builtId={getOccupant(r, c, builtStructures)?.structId}
            selected={selected}
            isValidBuild={validBuildCells?.has(`${r},${c}`) ?? false}
            isPickedUp={pickedUpCells?.has(`${r},${c}`) ?? false}
            purchasable={purchasableCells?.has(`${r},${c}`) ?? false}
            onCellClick={onCellClick}
            onCellHover={onCellHover}
          />
        ))
      )}

      {/* Castle */}
      <Castle3D />

      {/* City gate — tracks the south wall */}
      <CityGate3D gateZ={gateZ} />

      {/* Ghost placement preview (move mode, phase 2) */}
      {movingStructure && hoverCell && (
        <GhostFootprint
          r={hoverCell.r}
          c={hoverCell.c}
          isValid={validBuildCells?.has(`${hoverCell.r},${hoverCell.c}`) ?? false}
        />
      )}

      {/* Built structures */}
      {Object.entries(builtStructures).map(([cellKey, structId]) => {
        const [cr, cc] = cellKey.split(',').map(Number)
        const [cx, , cz] = footprintCenter(cr, cc)
        if (structId === 'granary') return <Granary3D key={cellKey} cx={cx} cz={cz} />
        if (structId === 'market')  return <Market3D  key={cellKey} cx={cx} cz={cz} />
        if (structId === 'house')   return <House3D   key={cellKey} cx={cx} cz={cz} />
        return null
      })}
    </>
  )
}

// ─── UI components ─────────────────────────────────────────────────────────────

function Resource({ icon, label, value, valueClass = '' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-base leading-none">{icon}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass}`}>{value}</span>
      <span className="hidden sm:inline text-xs text-slate-500">{label}</span>
    </div>
  )
}

function MarketIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Posts */}
      <rect x="7" y="22" width="3" height="12" fill="#78350f" />
      <rect x="30" y="22" width="3" height="12" fill="#78350f" />
      {/* Counter */}
      <rect x="6" y="30" width="28" height="4" rx="1" fill="#92400e" />
      {/* Awning stripes */}
      <clipPath id="awning-clip">
        <polygon points="4,22 36,22 33,12 7,12" />
      </clipPath>
      <rect x="4" y="12" width="6" height="11" fill="#dc2626" clipPath="url(#awning-clip)" />
      <rect x="10" y="12" width="6" height="11" fill="#fef3c7" clipPath="url(#awning-clip)" />
      <rect x="16" y="12" width="6" height="11" fill="#dc2626" clipPath="url(#awning-clip)" />
      <rect x="22" y="12" width="6" height="11" fill="#fef3c7" clipPath="url(#awning-clip)" />
      <rect x="28" y="12" width="8" height="11" fill="#dc2626" clipPath="url(#awning-clip)" />
      <polygon points="4,22 36,22 33,12 7,12" fill="none" stroke="#b91c1c" strokeWidth="0.8" />
      {/* Produce on counter */}
      <circle cx="12" cy="29" r="2" fill="#ef4444" />
      <circle cx="17" cy="29" r="2" fill="#f97316" />
      <circle cx="22" cy="29" r="2" fill="#eab308" />
      <circle cx="27" cy="29" r="2" fill="#a855f7" />
    </svg>
  )
}

function GranaryIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Walls */}
      <rect x="8" y="20" width="24" height="16" fill="#f5f0e8" stroke="#d1c9b8" strokeWidth="0.8" />
      {/* Roof */}
      <polygon points="5,20 20,8 35,20" fill="#78350f" />
      {/* Door */}
      <rect x="16" y="28" width="8" height="8" rx="1" fill="#78350f" />
      {/* Door arch top */}
      <ellipse cx="20" cy="28" rx="4" ry="2.5" fill="#78350f" />
      {/* Window */}
      <rect x="10" y="22" width="5" height="5" rx="0.5" fill="#d1c9b8" stroke="#a09880" strokeWidth="0.5" />
      <rect x="25" y="22" width="5" height="5" rx="0.5" fill="#d1c9b8" stroke="#a09880" strokeWidth="0.5" />
    </svg>
  )
}

function HouseIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Walls */}
      <rect x="8" y="20" width="22" height="16" fill="#ede8de" stroke="#d1c9b8" strokeWidth="0.8" />
      {/* Timber framing */}
      <line x1="8" y1="20" x2="30" y2="36" stroke="#2d1a0a" strokeWidth="1.2" />
      <line x1="30" y1="20" x2="8" y2="36" stroke="#2d1a0a" strokeWidth="1.2" />
      <line x1="8" y1="28" x2="30" y2="28" stroke="#2d1a0a" strokeWidth="1.2" />
      {/* Roof */}
      <polygon points="5,20 19,8 33,20" fill="#78350f" />
      {/* Chimney */}
      <rect x="24" y="10" width="4" height="8" fill="#6b5c4e" />
      {/* Door */}
      <rect x="16" y="28" width="7" height="8" rx="1" fill="#78350f" />
      {/* Farm plot */}
      <rect x="32" y="26" width="6" height="8" fill="#3d2b1f" rx="0.5" />
      <line x1="35" y1="26" x2="35" y2="34" stroke="#22c55e" strokeWidth="1" />
      <line x1="32" y1="30" x2="38" y2="30" stroke="#22c55e" strokeWidth="1" />
    </svg>
  )
}

function StructureCard({ structure, resources, selected, onSelect, onCancel }) {
  const canAfford = Object.entries(structure.cost).every(
    ([res, amt]) => resources[res] >= amt
  )
  const isActive = selected === structure.id

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
      isActive ? 'bg-amber-950 border-amber-600' : 'bg-slate-800 border-slate-700 hover:border-slate-600'
    }`}>
      <span className="shrink-0 w-10 h-10 flex items-center justify-center">
        {structure.renderIcon ? structure.renderIcon() : <span className="text-3xl">{structure.emoji}</span>}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm">{structure.name}</p>
        <p className="text-slate-400 text-xs mt-0.5 truncate">{structure.desc}</p>
        <div className="flex items-center gap-3 mt-1.5 text-xs">
          {structure.cost.food      > 0 && <span className={structure.cost.food      > resources.food      ? 'text-red-400' : 'text-slate-300'}>🍎 {structure.cost.food}</span>}
          {structure.cost.wood      > 0 && <span className={structure.cost.wood      > resources.wood      ? 'text-red-400' : 'text-slate-300'}>🪵 {structure.cost.wood}</span>}
          {structure.cost.knowledge > 0 && <span className={structure.cost.knowledge > resources.knowledge ? 'text-red-400' : 'text-slate-300'}>📚 {structure.cost.knowledge}</span>}
          {Object.values(structure.cost).every(v => v === 0) && <span className="text-slate-500">Free</span>}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs">
          <span className="text-slate-600">Generates:</span>
          {structure.generates.map(g => (
            <span key={g.label} className="text-emerald-400 font-medium">
              {g.icon} +{g.value} {g.label}
            </span>
          ))}
        </div>
      </div>
      {isActive ? (
        <button
          onClick={onCancel}
          className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
      ) : (
        <button
          onClick={() => canAfford && onSelect(structure.id)}
          disabled={!canAfford}
          className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-700 hover:bg-amber-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Build
        </button>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function City() {
  const navigate = useNavigate()
  const [user, setUser]         = useState(null)
  const [map, setMap]           = useState(() => {
    const g = createInitialMap()
    g.forEach((row, r) => row.forEach((cell, c) => { cell._r = r; cell._c = c }))
    return g
  })
  const [resources, setResources]             = useState({ food: 0, knowledge: 0, wood: 0 })
  const [builtStructures, setBuiltStructures] = useState({})
  const [purchasedTerritory, setPurchasedTerritory] = useState(new Set())
  const [activeTab, setActiveTab]             = useState('structures')
  const [selected, setSelected]               = useState(null)
  const [movingStructure, setMovingStructure] = useState(null) // { structId, fromKey } when picking up

  // money = (markets × 10) − cells purchased
  const money = useMemo(
    () => 20 + Object.values(builtStructures).filter(id => id === 'market').length * 10 - purchasedTerritory.size,
    [builtStructures, purchasedTerritory]
  )

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate('/', { replace: true }); return }
      setUser(session.user)
      const uid = session.user.id

      const [{ data: ud }, { data: structs }, { data: territory }, { data: roads }] = await Promise.all([
        supabase
          .from('user_data')
          .select('food_points, knowledge_points, wood_points')
          .eq('user_id', uid)
          .maybeSingle(),
        supabase
          .from('city_structures')
          .select('row_idx, col_idx, structure_id')
          .eq('user_id', uid),
        supabase
          .from('city_territory')
          .select('row_idx, col_idx')
          .eq('user_id', uid),
        supabase
          .from('city_roads')
          .select('row_idx, col_idx, placed')
          .eq('user_id', uid),
      ])

      if (ud) {
        setResources({
          food:      ud.food_points      ?? 0,
          knowledge: ud.knowledge_points ?? 0,
          wood:      ud.wood_points      ?? 0,
        })
      }
      if (structs) {
        const built = {}
        structs.forEach(s => { built[`${s.row_idx},${s.col_idx}`] = s.structure_id })
        setBuiltStructures(built)
      }

      const tSet = new Set((territory ?? []).map(t => `${t.row_idx},${t.col_idx}`))
      if (territory?.length > 0) setPurchasedTerritory(tSet)

      if (territory?.length > 0 || roads?.length > 0) {
        setMap(prev => {
          const next = prev.map(row => row.map(cell => ({ ...cell })))
          // Apply purchased territory
          territory?.forEach(({ row_idx, col_idx }) => {
            next[row_idx][col_idx].type = CELL.EMPTY
          })
          // Apply wall expansions
          const expanded = applyWallExpansions(next, tSet)
          // Apply road modifications:
          //   placed=true  → user added a road
          //   placed=false → user demolished an original road
          roads?.forEach(({ row_idx, col_idx, placed }) => {
            expanded[row_idx][col_idx].type = placed ? CELL.ROAD : CELL.EMPTY
          })
          return expanded
        })
      }
    })
  }, [navigate])

  const handleCellClick = useCallback((r, c) => {
    if (!selected) return
    const cell = map[r][c]

    // ── Demolish mode ──────────────────────────────────────────────────────────
    if (selected === 'demolish') {
      if (cell.type === CELL.ROAD) {
        setMap(prev => {
          const next = prev.map(row => row.map(cell => ({ ...cell })))
          next[r][c].type = CELL.EMPTY
          return next
        })
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          if (!session) return
          const isOriginal = ORIGINAL_MAP[r][c].type === CELL.ROAD
          const { error } = isOriginal
            // Mark original road as removed
            ? await supabase.from('city_roads').upsert(
                { user_id: session.user.id, row_idx: r, col_idx: c, placed: false },
                { onConflict: 'user_id,row_idx,col_idx' }
              )
            // Delete user-placed road record
            : await supabase.from('city_roads')
                .delete()
                .eq('user_id', session.user.id)
                .eq('row_idx', r)
                .eq('col_idx', c)
          if (error) {
            console.error('road demolish error:', error)
            setMap(prev => {
              const next = prev.map(row => row.map(cell => ({ ...cell })))
              next[r][c].type = CELL.ROAD
              return next
            })
          }
        })
        return
      }

      const occupant = getOccupant(r, c, builtStructures)
      if (occupant) {
        const { structId, key: topLeftKey } = occupant
        const [sr, sc] = topLeftKey.split(',').map(Number)
        const structure = STRUCTURES.find(s => s.id === structId)
        if (!structure) return

        const refund = {
          food:      Math.floor(structure.cost.food      * 0.8),
          knowledge: Math.floor(structure.cost.knowledge * 0.8),
          wood:      Math.floor(structure.cost.wood      * 0.8),
        }

        // Optimistic update
        setResources(prev => ({
          food:      prev.food      + refund.food,
          knowledge: prev.knowledge + refund.knowledge,
          wood:      prev.wood      + refund.wood,
        }))
        setBuiltStructures(prev => {
          const next = { ...prev }
          delete next[topLeftKey]
          return next
        })

        // Persist to DB
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          if (!session) return
          const { error } = await supabase.rpc('demolish_structure', {
            p_user_id:          session.user.id,
            p_row_idx:          sr,
            p_col_idx:          sc,
            p_food_refund:      refund.food,
            p_knowledge_refund: refund.knowledge,
            p_wood_refund:      refund.wood,
          })
          if (error) {
            console.error('demolish_structure error:', error)
            setResources(prev => ({
              food:      prev.food      - refund.food,
              knowledge: prev.knowledge - refund.knowledge,
              wood:      prev.wood      - refund.wood,
            }))
            setBuiltStructures(prev => ({ ...prev, [topLeftKey]: structId }))
          }
        })
      }
      return
    }

    // ── Move structure ─────────────────────────────────────────────────────────
    if (selected === 'move') {
      const occupant = getOccupant(r, c, builtStructures)

      // Phase 1: nothing in hand — pick up the clicked structure
      if (!movingStructure) {
        if (!occupant) return
        setMovingStructure({ structId: occupant.structId, fromKey: occupant.key })
        return
      }

      // Phase 2: structure in hand
      const { structId, fromKey } = movingStructure
      const [fr, fc] = fromKey.split(',').map(Number)

      // Clicking any cell of the picked-up structure cancels
      if (occupant?.key === fromKey) {
        setMovingStructure(null)
        return
      }

      // Validate drop: 2×2 EMPTY and unoccupied (treating from-footprint as clear)
      if (r + 1 >= GRID_SIZE || c + 1 >= GRID_SIZE) return
      const fromFootprint = new Set([
        `${fr},${fc}`, `${fr},${fc+1}`, `${fr+1},${fc}`, `${fr+1},${fc+1}`
      ])
      const canDrop = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]].every(([tr,tc]) => {
        if (map[tr][tc].type !== CELL.EMPTY) return false
        const occ = getOccupant(tr, tc, builtStructures)
        return !occ || fromFootprint.has(`${tr},${tc}`)
      })
      if (!canDrop) return

      // No-op: dropping at same position
      if (r === fr && c === fc) { setMovingStructure(null); return }

      const toKey = `${r},${c}`

      // Optimistic update
      setBuiltStructures(prev => {
        const next = { ...prev }
        delete next[fromKey]
        next[toKey] = structId
        return next
      })
      setMovingStructure(null)

      // Persist
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return
        const { error } = await supabase.rpc('move_structure', {
          p_user_id:  session.user.id,
          p_from_row: fr,
          p_from_col: fc,
          p_to_row:   r,
          p_to_col:   c,
        })
        if (error) {
          console.error('move_structure error:', error)
          setBuiltStructures(prev => {
            const next = { ...prev }
            delete next[toKey]
            next[fromKey] = structId
            return next
          })
        }
      })
      return
    }

    // ── Expand territory ───────────────────────────────────────────────────────
    if (selected === 'expand') {
      if (map[r][c].type !== CELL.GRASS) return
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]]
      const isAdj = dirs.some(([dr, dc]) => {
        const nr = r + dr, nc = c + dc
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return false
        const nt = map[nr][nc].type
        return nt === CELL.WALL || nt === CELL.EMPTY || nt === CELL.ROAD
      })
      if (!isAdj) return
      const currentMoney = 20 + Object.values(builtStructures).filter(id => id === 'market').length * 10 - purchasedTerritory.size
      if (currentMoney < 1) return

      const key = `${r},${c}`
      const newTerritory = new Set([...purchasedTerritory, key])
      setPurchasedTerritory(newTerritory)
      setMap(prev => {
        const next = prev.map(row => row.map(cell => ({ ...cell })))
        next[r][c].type = CELL.EMPTY
        return applyWallExpansions(next, newTerritory)
      })

      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return
        const { error } = await supabase.from('city_territory').insert({
          user_id: session.user.id,
          row_idx: r,
          col_idx: c,
        })
        if (error) {
          console.error('buy_territory error:', error)
          setPurchasedTerritory(prev => { const next = new Set(prev); next.delete(key); return next })
          setMap(prev => {
            const next = prev.map(row => row.map(cell => ({ ...cell })))
            next[r][c].type = CELL.GRASS
            return next
          })
        }
      })
      return
    }

    // ── Road placement ─────────────────────────────────────────────────────────
    if (selected === 'road') {
      if (cell.type !== CELL.EMPTY) return
      setMap(prev => {
        const next = prev.map(row => row.map(cell => ({ ...cell })))
        next[r][c].type = CELL.ROAD
        return next
      })
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return
        const { error } = await supabase.from('city_roads').upsert(
          { user_id: session.user.id, row_idx: r, col_idx: c, placed: true },
          { onConflict: 'user_id,row_idx,col_idx' }
        )
        if (error) {
          console.error('road save error:', error)
          setMap(prev => {
            const next = prev.map(row => row.map(cell => ({ ...cell })))
            next[r][c].type = CELL.EMPTY
            return next
          })
        }
      })
      return
    }

    // ── Build structure ────────────────────────────────────────────────────────
    if (cell.type !== CELL.EMPTY) return
    // Validate the 2×2 footprint: all 4 cells must be EMPTY and unoccupied
    if (r + 1 >= GRID_SIZE || c + 1 >= GRID_SIZE) return
    const allEmpty = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]].every(
      ([tr,tc]) => map[tr][tc].type === CELL.EMPTY && !getOccupant(tr, tc, builtStructures)
    )
    if (!allEmpty) return
    const cellKey = `${r},${c}`
    const structure = STRUCTURES.find(s => s.id === selected)
    if (!structure) return
    if (!Object.entries(structure.cost).every(([res, amt]) => resources[res] >= amt)) return

    // Optimistic update
    setResources(prev => ({
      food:      prev.food      - structure.cost.food,
      wood:      prev.wood      - structure.cost.wood,
      knowledge: prev.knowledge - structure.cost.knowledge,
    }))
    setBuiltStructures(prev => ({ ...prev, [cellKey]: selected }))
    setSelected(null)

    // Persist to DB
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { error } = await supabase.rpc('build_structure', {
        p_user_id:        session.user.id,
        p_row_idx:        r,
        p_col_idx:        c,
        p_structure_id:   selected,
        p_food_cost:      structure.cost.food,
        p_knowledge_cost: structure.cost.knowledge,
        p_wood_cost:      structure.cost.wood,
      })
      if (error) {
        console.error('build_structure error:', error)
        // Roll back optimistic update
        setResources(prev => ({
          food:      prev.food      + structure.cost.food,
          wood:      prev.wood      + structure.cost.wood,
          knowledge: prev.knowledge + structure.cost.knowledge,
        }))
        setBuiltStructures(prev => {
          const next = { ...prev }
          delete next[cellKey]
          return next
        })
      }
    })
  }, [selected, map, builtStructures, resources, purchasedTerritory, movingStructure])

  if (!user) return null

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden select-none">

      {/* ── HUD ── */}
      <div className="flex items-center justify-between px-3 sm:px-5 h-12 bg-slate-900/90 border-b border-slate-800 shrink-0 z-10">
        <div className="flex items-center gap-3 sm:gap-5">
          <Resource icon="🍎" label="Food"      value={resources.food}      />
          <Resource icon="📖" label="Knowledge" value={resources.knowledge} />
          <Resource icon="🪵" label="Wood"      value={resources.wood}      />
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          {(() => {
            const grain      = Object.values(builtStructures).filter(id => id === 'granary').length * 10
            const population = 20 + Object.values(builtStructures).filter(id => id === 'house').length * 4
            const shortage   = grain < population
            return (
              <>
                <Resource
                  icon="🌾"
                  label="Grain"
                  value={<>{grain}<span className="text-slate-600 font-normal">/{population}</span></>}
                  valueClass={shortage ? 'text-red-400' : ''}
                />
                {(() => {
                  const grainShortage = Math.max(0, population - grain)
                  const happiness = 10 - Math.floor(population / 4) - grainShortage
                  return (
                    <Resource
                      icon={happiness >= 0 ? '😊' : '😞'}
                      label="Happiness"
                      value={happiness}
                      valueClass={happiness < 0 ? 'text-red-400' : ''}
                    />
                  )
                })()}
                <Resource icon="👥" label="Population" value={population} />
                <Resource icon="💰" label="Money" value={money} valueClass={money < 1 ? 'text-red-400' : ''} />
              </>
            )
          })()}
          <Link to="/dashboard" className="text-xs text-slate-400 hover:text-white transition-colors">
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* ── 3D canvas ── */}
      <div className="flex-1 relative">
        <Canvas
          shadows
          camera={{ position: [13, 14, 14], fov: 50, near: 0.1, far: 200 }}
          style={{ background: '#c9e8f5' }}
        >
          <GameScene
            map={map}
            builtStructures={builtStructures}
            selected={selected}
            movingStructure={movingStructure}
            purchasedTerritory={purchasedTerritory}
            onCellClick={handleCellClick}
          />
        </Canvas>

        {/* Build/demolish mode hint */}
        {selected && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-10">
            <div className={`border text-xs px-3 py-1.5 rounded-full shadow-lg ${
              selected === 'demolish'
                ? 'bg-red-900/90 border-red-700 text-red-200'
                : selected === 'expand'
                  ? 'bg-yellow-900/90 border-yellow-700 text-yellow-200'
                  : selected === 'move'
                    ? 'bg-cyan-900/90 border-cyan-700 text-cyan-200'
                    : selected === 'road'
                      ? 'bg-slate-800/90 border-slate-600 text-slate-200'
                      : 'bg-amber-900/90 border-amber-600 text-amber-200'
            }`}>
              {selected === 'demolish'
                ? 'Click a glowing structure or road to demolish it'
                : selected === 'expand'
                  ? `Click a glowing cell to purchase it — 💰 ${money} available`
                  : selected === 'move'
                    ? movingStructure
                      ? 'Click a green cell to drop — or click the building again to cancel'
                      : 'Click a building to pick it up'
                    : selected === 'road'
                      ? 'Click empty territory to lay a road'
                      : 'Click a glowing slot to place'}
            </div>
          </div>
        )}
      </div>

      {/* ── Build panel ── */}
      <div className="shrink-0 bg-slate-900 border-t border-slate-800 flex flex-col" style={{ height: '240px' }}>
        <div className="flex border-b border-slate-800 shrink-0">
          {[
            { id: 'structures', label: 'Structures' },
            { id: 'roads',      label: 'Roads' },
            { id: 'move',       label: '🔄 Move' },
            { id: 'expand',     label: '🗺 Expand' },
            { id: 'demolish',   label: '⛏ Demolish' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setMovingStructure(null)
                setSelected(
                  tab.id === 'demolish' ? 'demolish' :
                  tab.id === 'expand'   ? 'expand'   :
                  tab.id === 'move'     ? 'move'      : null
                )
              }}
              className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? tab.id === 'demolish'
                    ? 'text-red-300 border-b-2 border-red-500'
                    : tab.id === 'expand'
                      ? 'text-yellow-300 border-b-2 border-yellow-500'
                      : tab.id === 'move'
                        ? 'text-cyan-300 border-b-2 border-cyan-500'
                        : 'text-white border-b-2 border-amber-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === 'structures' && (
            <div className="space-y-2">
              {STRUCTURES.map(s => (
                <StructureCard
                  key={s.id}
                  structure={s}
                  resources={resources}
                  selected={selected}
                  onSelect={setSelected}
                  onCancel={() => setSelected(null)}
                />
              ))}
            </div>
          )}
          {activeTab === 'roads' && (
            <div
              className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                selected === 'road' ? 'bg-slate-700 border-slate-500' : 'bg-slate-800 border-slate-700 hover:border-slate-600'
              }`}
              onClick={() => setSelected(prev => prev === 'road' ? null : 'road')}
            >
              <span className="text-3xl">🛤️</span>
              <div className="flex-1">
                <p className="font-semibold text-white text-sm">Dirt Road</p>
                <p className="text-slate-400 text-xs mt-0.5">Connect your buildings</p>
                <p className="text-slate-500 text-xs mt-1">Free</p>
              </div>
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                selected === 'road' ? 'border-slate-500 text-slate-300' : 'border-slate-600 bg-slate-700 text-white'
              }`}>
                {selected === 'road' ? 'Cancel' : 'Build'}
              </span>
            </div>
          )}
          {activeTab === 'move' && (
            <div className="p-1">
              <div className="bg-cyan-950/40 border border-cyan-900/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🔄</span>
                  <p className="text-cyan-300 text-sm font-semibold">
                    {movingStructure ? 'Drop the building' : 'Move a building'}
                  </p>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  {movingStructure
                    ? <>Click a <span className="text-green-400 font-medium">green cell</span> to place the building, or click it again to cancel.</>
                    : <>Click any <span className="text-cyan-300 font-medium">glowing building</span> to pick it up, then click any empty 2×2 area to place it.</>
                  }
                </p>
                <p className="text-slate-500 text-xs mt-2.5 pt-2.5 border-t border-cyan-900/30">
                  Moving is free — no resources are spent or refunded.
                </p>
              </div>
            </div>
          )}
          {activeTab === 'expand' && (
            <div className="p-1">
              <div className="bg-yellow-950/40 border border-yellow-900/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🗺️</span>
                    <p className="text-yellow-300 text-sm font-semibold">Expand territory</p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${money < 1 ? 'text-red-400' : 'text-yellow-300'}`}>
                    💰 {money} available
                  </span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Click any <span className="text-yellow-300 font-medium">glowing cell</span> outside the walls to annex it. Purchased land can have roads built on it.
                </p>
                <p className="text-slate-500 text-xs mt-2.5 pt-2.5 border-t border-yellow-900/30">
                  Cost: <span className="text-yellow-400 font-medium">1 💰 per cell.</span> Build markets to earn more money.
                </p>
              </div>
            </div>
          )}
          {activeTab === 'demolish' && (
            <div className="p-1">
              <div className="bg-red-950/40 border border-red-900/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">⛏️</span>
                  <p className="text-red-300 text-sm font-semibold">Demolish mode active</p>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Click any <span className="text-red-300 font-medium">built structure</span> or <span className="text-red-300 font-medium">road</span> on the map to remove it. Demolishable tiles glow red.
                </p>
                <p className="text-slate-500 text-xs mt-2.5 pt-2.5 border-t border-red-900/30">
                  Structures refund <span className="text-amber-400 font-medium">80%</span> of their build cost. Roads are free to remove.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

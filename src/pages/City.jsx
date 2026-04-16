import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls, Sky } from '@react-three/drei'
import { supabase } from '../lib/supabase'
import {
  createInitialMap, GRID_SIZE, CELL,
  STRUCTURE_SLOTS, CASTLE_ROW, CASTLE_COL, CASTLE_SPAN, grassShade,
} from '../game/mapData'

// ─── Game data ────────────────────────────────────────────────────────────────

const STRUCTURES = [
  {
    id: 'granary',
    name: 'Granary',
    emoji: '🌾',
    desc: 'Stores food for your growing city.',
    cost: { wood: 20, food: 0, knowledge: 0 },
  },
]

const GRASS_HEX = ['#166534', '#15803d', '#14532d']

// cell (r, c) → world [x, y, z] center at ground level
function cellWorld(r, c) { return [c - 8.5, 0, r - 8.5] }

// 2×2 slot top-left (sr, sc) → world center
function slotWorld(sr, sc) { return [sc - 8, 0, sr - 8] }

// ─── Ground tile ───────────────────────────────────────────────────────────────

function GroundTile({ cell, builtId, selected, onCellClick }) {
  const r = cell._r, c = cell._c
  const [wx, , wz] = cellWorld(r, c)

  let color, height, emissive = '#000000', emissiveIntensity = 0

  switch (cell.type) {
    case CELL.GRASS:
      color = GRASS_HEX[grassShade(r, c)]; height = 0.12; break
    case CELL.WALL:
      color = '#9ca3af'; height = 2.0; break
    case CELL.EMPTY:
      color = '#c8a97e'; height = 0.12; break
    case CELL.ROAD:
      color = '#57534e'; height = 0.14; break
    case CELL.CASTLE:
      color = '#334155'; height = 0.12; break
    case CELL.SLOT:
      if (builtId) { color = '#78350f'; height = 0.12 }
      else if (selected && selected !== 'road') {
        color = '#fbbf24'; height = 0.20
        emissive = '#d97706'; emissiveIntensity = 0.35
      } else {
        color = '#b45309'; height = 0.16
      }
      break
    default:
      color = '#15803d'; height = 0.12
  }

  const clickable =
    (cell.type === CELL.SLOT && !builtId && selected && selected !== 'road') ||
    (cell.type === CELL.EMPTY && selected === 'road')

  return (
    <mesh
      position={[wx, height / 2, wz]}
      onClick={clickable ? e => { e.stopPropagation(); onCellClick(r, c) } : undefined}
      onPointerEnter={clickable ? e => { e.stopPropagation(); e.object.material.emissiveIntensity = emissiveIntensity + 0.3 } : undefined}
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

// ─── Surrounding grass tiles ──────────────────────────────────────────────────

const GRASS_PADDING = 10

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

// ─── City Gate 3D ─────────────────────────────────────────────────────────────
// Positioned at the south wall opening: row 16 → world z = 7.5, cols 8-9 center → x = 0
// Towers sit on wall tiles at cols 7 (x=-1.5) and 10 (x=1.5)

function CityGate3D() {
  const STONE = '#9ca3af'  // matches city wall tiles
  const DARK  = '#6b7280'
  const VOID  = '#0f172a'
  const GATE_DOOR = '#78350f'

  return (
    <group position={[0, 0, 7.5]}>
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

function GameScene({ map, builtStructures, selected, onCellClick }) {
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
            builtId={cell.slotId != null ? builtStructures[cell.slotId] : undefined}
            selected={selected}
            onCellClick={onCellClick}
          />
        ))
      )}

      {/* Castle */}
      <Castle3D />

      {/* City gate at the south wall */}
      <CityGate3D />

      {/* Built structures */}
      {Object.entries(builtStructures).map(([slotId, structId]) => {
        const [sr, sc] = STRUCTURE_SLOTS[parseInt(slotId)]
        const [cx, , cz] = slotWorld(sr, sc)
        if (structId === 'granary') return <Granary3D key={slotId} cx={cx} cz={cz} />
        return null
      })}
    </>
  )
}

// ─── UI components ─────────────────────────────────────────────────────────────

function Resource({ icon, label, value }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="hidden sm:inline text-xs text-slate-500">{label}</span>
    </div>
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
      <span className="text-3xl shrink-0">{structure.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm">{structure.name}</p>
        <p className="text-slate-400 text-xs mt-0.5 truncate">{structure.desc}</p>
        <div className="flex items-center gap-3 mt-1.5 text-xs">
          {structure.cost.wood > 0 && (
            <span className={structure.cost.wood > resources.wood ? 'text-red-400' : 'text-slate-300'}>
              🪵 {structure.cost.wood}
            </span>
          )}
          {Object.values(structure.cost).every(v => v === 0) && (
            <span className="text-slate-500">Free</span>
          )}
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
  const [resources, setResources]           = useState({ food: 0, knowledge: 0, wood: 0 })
  const [builtStructures, setBuiltStructures] = useState({})
  const [activeTab, setActiveTab]           = useState('structures')
  const [selected, setSelected]             = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate('/', { replace: true }); return }
      setUser(session.user)
      const uid = session.user.id

      const [{ data: ud }, { data: structs }] = await Promise.all([
        supabase
          .from('user_data')
          .select('food_points, knowledge_points, wood_points')
          .eq('user_id', uid)
          .maybeSingle(),
        supabase
          .from('city_structures')
          .select('slot_id, structure_id')
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
        structs.forEach(s => { built[s.slot_id] = s.structure_id })
        setBuiltStructures(built)
      }
    })
  }, [navigate])

  const handleCellClick = useCallback((r, c) => {
    if (!selected) return
    const cell = map[r][c]

    if (selected === 'road') {
      if (cell.type !== CELL.EMPTY) return
      setMap(prev => {
        const next = prev.map(row => row.map(cell => ({ ...cell })))
        next[r][c].type = CELL.ROAD
        return next
      })
      return
    }

    if (cell.type !== CELL.SLOT) return
    const slotId = cell.slotId
    if (builtStructures[slotId] !== undefined) return
    const structure = STRUCTURES.find(s => s.id === selected)
    if (!structure) return
    if (!Object.entries(structure.cost).every(([res, amt]) => resources[res] >= amt)) return

    // Optimistic update
    setResources(prev => ({
      food:      prev.food      - structure.cost.food,
      wood:      prev.wood      - structure.cost.wood,
      knowledge: prev.knowledge - structure.cost.knowledge,
    }))
    setBuiltStructures(prev => ({ ...prev, [slotId]: selected }))
    setSelected(null)

    // Persist to DB
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { error } = await supabase.rpc('build_structure', {
        p_user_id:        session.user.id,
        p_slot_id:        slotId,
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
          delete next[slotId]
          return next
        })
      }
    })
  }, [selected, map, builtStructures, resources])

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
        <Link to="/dashboard" className="text-xs text-slate-400 hover:text-white transition-colors">
          ← Dashboard
        </Link>
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
            onCellClick={handleCellClick}
          />
        </Canvas>

        {/* Build-mode hint */}
        {selected && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-10">
            <div className={`border text-xs px-3 py-1.5 rounded-full shadow-lg ${
              selected === 'road'
                ? 'bg-slate-800/90 border-slate-600 text-slate-200'
                : 'bg-amber-900/90 border-amber-600 text-amber-200'
            }`}>
              {selected === 'road'
                ? 'Click empty territory to lay a road'
                : 'Click a glowing slot to place'}
            </div>
          </div>
        )}
      </div>

      {/* ── Build panel ── */}
      <div className="shrink-0 bg-slate-900 border-t border-slate-800" style={{ maxHeight: '220px' }}>
        <div className="flex border-b border-slate-800">
          {['structures', 'roads'].map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelected(null) }}
              className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'text-white border-b-2 border-amber-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-3 overflow-y-auto" style={{ maxHeight: '160px' }}>
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
        </div>
      </div>
    </div>
  )
}

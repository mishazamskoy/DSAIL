import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Nav from '../components/Nav'

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser]         = useState(null)
  const [userData, setUserData] = useState({ total: 0, food: 0, knowledge: 0, wood: 0, grain: 0, happiness: 0, population: 0, money: 0, activities: 0 })

  const [activityText, setActivityText] = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [award, setAward]               = useState(null)
  const [submitError, setSubmitError]   = useState(null)

  const [activityLogs, setActivityLogs]   = useState(null)
  const [leaderboard, setLeaderboard]     = useState(null)

  const [advisorQuestion, setAdvisorQuestion] = useState('')
  const [advisorAdvice, setAdvisorAdvice]     = useState(null)
  const [advisorLoading, setAdvisorLoading]   = useState(false)
  const [advisorError, setAdvisorError]       = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate('/', { replace: true }); return }
      setUser(session.user)
      const uid = session.user.id
      const [{ data: ud }, { data: logs }, { data: lb }, { data: structs }, { data: territory }] = await Promise.all([
        supabase
          .from('user_data')
          .select('total_points, activities_count, food_points, knowledge_points, wood_points')
          .eq('user_id', uid)
          .maybeSingle(),
        supabase
          .from('activity_logs')
          .select('id, activity_text, grain_points, happiness_points, population_points, money_points, food_points, knowledge_points, wood_points, total_points, logged_at')
          .eq('user_id', uid)
          .order('logged_at', { ascending: false })
          .limit(20),
        supabase.rpc('get_leaderboard'),
        supabase
          .from('city_structures')
          .select('structure_id')
          .eq('user_id', uid),
        supabase
          .from('city_territory')
          .select('row_idx')
          .eq('user_id', uid),
      ])

      // Compute city metrics from actual built structures — same formulas as City.jsx
      const numGranaries  = (structs ?? []).filter(s => s.structure_id === 'granary').length
      const numHouses     = (structs ?? []).filter(s => s.structure_id === 'house').length
      const numMarkets    = (structs ?? []).filter(s => s.structure_id === 'market').length
      const numSchools    = (structs ?? []).filter(s => s.structure_id === 'school').length
      const numTerritory  = (territory ?? []).length

      const grain         = numGranaries * 10 + numSchools * 2
      const population    = 20 + numHouses * 4
      const grainShortage = Math.max(0, population - grain)
      const happiness     = 10 - Math.floor(population / 4) - grainShortage + numSchools * 2
      const money         = 20 + numMarkets * 10 + numSchools * 4 - numTerritory

      // New account: ensure the user_data row exists so future build_structure calls can find it
      if (!ud) {
        await supabase.from('user_data')
          .upsert({ user_id: uid }, { onConflict: 'user_id', ignoreDuplicates: true })
      }

      setUserData({
        total:      ud?.total_points      ?? 0,
        activities: ud?.activities_count  ?? 0,
        food:       ud?.food_points       ?? 0,
        knowledge:  ud?.knowledge_points  ?? 0,
        wood:       ud?.wood_points       ?? 0,
        grain,
        happiness,
        population,
        money,
      })
      setActivityLogs(logs ?? [])
      setLeaderboard(lb ?? [])
    })
  }, [navigate])

  if (!user) return null

  const power = Math.max(userData.grain - userData.population, 0)
              + userData.happiness
              + userData.population
              + userData.money

  const displayName =
    user.user_metadata?.full_name  ||
    user.user_metadata?.user_name  ||
    user.email

  const initials = displayName
    ? displayName.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const avatarUrl  = user.user_metadata?.avatar_url

  async function handleSubmitActivity(e) {
    e.preventDefault()
    if (!activityText.trim() || submitting) return
    setSubmitting(true); setAward(null); setSubmitError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate-activity`,
        { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ activityText: activityText.trim() }) }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      const result = await res.json()
      setAward(result)
      setActivityLogs(prev => [{
        id: crypto.randomUUID(),
        activity_text:     activityText.trim(),
        food_points:       result.food_points       ?? 0,
        knowledge_points:  result.knowledge_points  ?? 0,
        wood_points:       result.wood_points       ?? 0,
        grain_points:      0,
        happiness_points:  0,
        population_points: 0,
        money_points:      0,
        total_points:      result.total_earned      ?? 0,
        logged_at: new Date().toISOString(),
      }, ...(prev ?? [])].slice(0, 20))
      setActivityText('')
      const [{ data: ud2 }, { data: structs2 }, { data: territory2 }] = await Promise.all([
        supabase.from('user_data').select('total_points, activities_count, food_points, knowledge_points, wood_points').eq('user_id', user.id).maybeSingle(),
        supabase.from('city_structures').select('structure_id').eq('user_id', user.id),
        supabase.from('city_territory').select('row_idx').eq('user_id', user.id),
      ])
      const numGranaries2  = (structs2  ?? []).filter(s => s.structure_id === 'granary').length
      const numHouses2     = (structs2  ?? []).filter(s => s.structure_id === 'house').length
      const numMarkets2    = (structs2  ?? []).filter(s => s.structure_id === 'market').length
      const numSchools2    = (structs2  ?? []).filter(s => s.structure_id === 'school').length
      const numTerritory2  = (territory2 ?? []).length
      const grain2         = numGranaries2 * 10 + numSchools2 * 2
      const population2    = 20 + numHouses2 * 4
      const grainShortage2 = Math.max(0, population2 - grain2)
      const happiness2     = 10 - Math.floor(population2 / 4) - grainShortage2 + numSchools2 * 2
      const money2         = 20 + numMarkets2 * 10 + numSchools2 * 4 - numTerritory2
      setUserData({
        total:      ud2?.total_points     ?? 0,
        activities: ud2?.activities_count ?? 0,
        food:       ud2?.food_points      ?? 0,
        knowledge:  ud2?.knowledge_points ?? 0,
        wood:       ud2?.wood_points      ?? 0,
        grain:      grain2,
        happiness:  happiness2,
        population: population2,
        money:      money2,
      })
    } catch (err) {
      console.error(err)
      setSubmitError(err.message || 'Something went wrong. Please try again.')
    } finally { setSubmitting(false) }
  }

  async function handleAskAdvisor(e) {
    e.preventDefault()
    if (advisorLoading) return
    setAdvisorLoading(true); setAdvisorAdvice(null); setAdvisorError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/city-advisor`,
        { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ question: advisorQuestion.trim() }) }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      const result = await res.json()
      setAdvisorAdvice(result.advice)
      setAdvisorQuestion('')
    } catch (err) {
      console.error(err)
      setAdvisorError(err.message || 'The advisor is unavailable. Try again.')
    } finally { setAdvisorLoading(false) }
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <Nav />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">

        {/* ── Welcome ── */}
        <section className="flex items-center gap-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full shrink-0 ring-2 ring-white shadow-sm" />
          ) : (
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-amber-100 border-2 border-white shadow-sm flex items-center justify-center text-sm font-bold text-amber-700 shrink-0 select-none">
              {initials}
            </div>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              Welcome back, <span className="text-amber-600">{displayName}</span>
            </h1>
            <p className="text-stone-500 text-sm mt-0.5">
              Your realm grows stronger with every healthy choice.
            </p>
          </div>
        </section>

        {/* ── Kingdom stores ── */}
        <section>
          <SectionHeader>Kingdom Stores</SectionHeader>

          {/* Power — the headline stat */}
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 shadow-sm mb-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-widest text-amber-600/70 uppercase mb-1">City Power</p>
                <p className="text-4xl sm:text-5xl font-extrabold tabular-nums text-amber-600 leading-none">{power.toLocaleString()}</p>
                <p className="text-stone-400 text-xs mt-2 leading-relaxed">
                  {userData.grain >= userData.population
                    ? `Grain surplus ${userData.grain - userData.population} · Happiness ${userData.happiness} · Population ${userData.population} · Money ${userData.money}`
                    : `No grain surplus (shortage ${userData.population - userData.grain}) · Happiness ${userData.happiness} · Population ${userData.population} · Money ${userData.money}`}
                </p>
              </div>
              <span className="text-5xl sm:text-6xl leading-none shrink-0">⚡</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Food',      value: userData.food,      icon: '🍎', color: 'text-emerald-600', sub: 'From healthy eating'   },
              { label: 'Knowledge', value: userData.knowledge, icon: '📚', color: 'text-sky-600',     sub: 'From mind & wellness'  },
              { label: 'Wood',      value: userData.wood,      icon: '🪵', color: 'text-amber-700',   sub: 'From exercise & sport' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-sm">
                <span className="text-xl leading-none">{s.icon}</span>
                <p className={`text-2xl sm:text-3xl font-extrabold tabular-nums mt-3 ${s.color}`}>{s.value}</p>
                <p className="text-xs font-semibold text-stone-700 mt-1">{s.label}</p>
                <p className="text-[11px] text-stone-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── City CTA ── */}
        <section>
          <SectionHeader>The City</SectionHeader>
          <Link to="/city"
            className="group flex items-center justify-between bg-white hover:bg-stone-50 transition-colors rounded-2xl border border-stone-200 px-6 sm:px-8 py-6 sm:py-8 shadow-sm">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-widest text-amber-600/60 uppercase mb-2">Open city view</p>
              <h2 className="text-xl sm:text-2xl font-bold text-stone-900 leading-snug">Your city awaits</h2>
              <p className="text-stone-400 text-sm mt-1">Build, expand, and grow your empire.</p>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-5">
              <span className="hidden sm:block text-4xl">🏰</span>
              <span className="bg-amber-500 group-hover:bg-amber-400 transition-colors text-stone-950 text-sm font-bold px-5 py-2.5 rounded-xl whitespace-nowrap shadow-sm">
                Enter City →
              </span>
            </div>
          </Link>
        </section>

        {/* ── Today's quest ── */}
        <section>
          <SectionHeader>Today's Quest</SectionHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* AI City Advisor */}
            <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base leading-none">👑</span>
                <h2 className="text-sm font-bold text-amber-700">AI City Advisor</h2>
              </div>
              <p className="text-stone-500 text-sm mb-5 leading-relaxed">
                Ask for personalised wellness guidance, or leave blank for today's suggestion.
              </p>
              <form onSubmit={handleAskAdvisor} className="space-y-2.5 mb-4">
                <input
                  type="text"
                  value={advisorQuestion}
                  onChange={e => setAdvisorQuestion(e.target.value)}
                  placeholder="e.g. What should I eat today? (optional)"
                  className="input"
                />
                <button
                  type="submit"
                  disabled={advisorLoading}
                  className="w-full px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors"
                >
                  {advisorLoading ? 'Consulting the advisor…' : 'Seek Counsel'}
                </button>
              </form>
              {advisorError && <p className="text-red-600 text-sm mb-3">{advisorError}</p>}
              {advisorAdvice ? (
                <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-stone-700 text-sm leading-relaxed">{advisorAdvice}</p>
                </div>
              ) : !advisorError && (
                <div className="flex-1 flex items-center justify-center py-6">
                  <p className="text-stone-400 text-sm italic">The advisor awaits your question…</p>
                </div>
              )}
            </div>

            {/* Log activity */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
              <h2 className="text-sm font-bold text-stone-900 mb-1">Chronicle Today's Deeds</h2>
              <p className="text-stone-500 text-sm mb-5 leading-relaxed">
                Describe your health activities. Claude evaluates your deeds and awards resources.
              </p>
              <form onSubmit={handleSubmitActivity} className="space-y-2.5">
                <textarea
                  value={activityText}
                  onChange={e => setActivityText(e.target.value)}
                  placeholder="e.g. Ran 5km this morning, had a salad for lunch, meditated for 20 minutes…"
                  rows={4}
                  className="input resize-none"
                />
                <button
                  type="submit"
                  disabled={submitting || !activityText.trim()}
                  className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 text-sm font-bold rounded-xl transition-colors shadow-sm"
                >
                  {submitting ? 'Claude is evaluating…' : 'Submit to Chronicle'}
                </button>
              </form>

              {submitError && <p className="text-red-600 text-sm mt-3">{submitError}</p>}

              {award && (
                <div className="mt-4 pt-4 border-t border-stone-100">
                  {award.total_earned === 0 ? (
                    <p className="text-stone-500 text-sm">{award.message}</p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-stone-700">{award.message}</p>
                      <div className="flex flex-wrap gap-2">
                        {award.food_points > 0 && (
                          <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-lg px-3 py-1.5">
                            🍎 +{award.food_points} food
                          </span>
                        )}
                        {award.knowledge_points > 0 && (
                          <span className="inline-flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-700 text-xs font-bold rounded-lg px-3 py-1.5">
                            📚 +{award.knowledge_points} knowledge
                          </span>
                        )}
                        {award.wood_points > 0 && (
                          <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-lg px-3 py-1.5">
                            🪵 +{award.wood_points} wood
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400">Total: +{award.total_earned} pts</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Leaderboard ── */}
        <section>
          <SectionHeader>Leaderboard</SectionHeader>
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">

            {/* Header row */}
            <div className="grid grid-cols-[2.5rem_1fr_auto] gap-3 px-4 sm:px-5 py-2.5 bg-stone-50 border-b border-stone-100">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider text-center">#</span>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Ruler</span>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Power ⚡</span>
            </div>

            {leaderboard === null && (
              <div className="px-5 py-8 text-center">
                <p className="text-stone-400 text-sm">Loading rankings…</p>
              </div>
            )}

            {leaderboard !== null && leaderboard.length === 0 && (
              <div className="px-5 py-8 text-center">
                <p className="text-stone-400 text-sm">No rulers ranked yet — be the first!</p>
              </div>
            )}

            {leaderboard !== null && leaderboard.length > 0 && (
              <div className="divide-y divide-stone-100">
                {leaderboard.map((row) => (
                  <div
                    key={row.rank}
                    className={`grid grid-cols-[2.5rem_1fr_auto] gap-3 items-center px-4 sm:px-5 py-3 transition-colors ${
                      row.is_me ? 'bg-amber-50' : 'hover:bg-stone-50'
                    }`}
                  >
                    {/* Rank */}
                    <div className="flex justify-center">
                      {row.rank === 1 ? (
                        <span className="text-lg leading-none">🏆</span>
                      ) : row.rank === 2 ? (
                        <span className="text-lg leading-none">🥈</span>
                      ) : row.rank === 3 ? (
                        <span className="text-lg leading-none">🥉</span>
                      ) : (
                        <span className={`text-sm font-bold tabular-nums ${row.is_me ? 'text-amber-600' : 'text-stone-400'}`}>
                          {row.rank}
                        </span>
                      )}
                    </div>

                    {/* Name + resource breakdown */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold truncate ${row.is_me ? 'text-amber-700' : 'text-stone-800'}`}>
                          {row.display_name}
                        </span>
                        {row.is_me && (
                          <span className="shrink-0 text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                            you
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-stone-400 tabular-nums">🌾{row.grain}</span>
                        <span className="text-[10px] text-stone-400 tabular-nums">😊{row.happiness}</span>
                        <span className="text-[10px] text-stone-400 tabular-nums">👥{row.population}</span>
                        <span className="text-[10px] text-stone-400 tabular-nums">💰{row.money}</span>
                      </div>
                    </div>

                    {/* Power */}
                    <span className={`text-sm font-extrabold tabular-nums ${row.is_me ? 'text-amber-600' : 'text-stone-700'}`}>
                      {row.power.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Current user not in top 10 */}
            {leaderboard !== null && leaderboard.length > 0 && !leaderboard.some(r => r.is_me) && (
              <div className="px-5 py-3 border-t border-stone-100 bg-stone-50">
                <p className="text-xs text-stone-400 text-center">
                  You're not in the top 10 yet — keep logging healthy activities to climb the ranks.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── Kingdom records ── */}
        <section className="pb-8">
          <SectionHeader>Kingdom Records</SectionHeader>

          {activityLogs === null && (
            <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center shadow-sm">
              <p className="text-stone-400 text-sm">Loading records…</p>
            </div>
          )}

          {activityLogs !== null && activityLogs.length === 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📜</p>
              <p className="font-semibold text-stone-800 mb-1">No records yet</p>
              <p className="text-stone-400 text-sm max-w-xs mx-auto">
                Submit your first activity above to begin your kingdom's chronicle.
              </p>
            </div>
          )}

          {activityLogs !== null && activityLogs.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden divide-y divide-stone-100">
              {activityLogs.map((log) => {
                const date    = new Date(log.logged_at)
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                const earned  = (log.food_points ?? 0) + (log.knowledge_points ?? 0) + (log.wood_points ?? 0)
                const badges  = [
                  (log.food_points      ?? 0) > 0 && { label: `+${log.food_points}`,      icon: '🍎', cls: 'text-emerald-600' },
                  (log.knowledge_points ?? 0) > 0 && { label: `+${log.knowledge_points}`, icon: '📚', cls: 'text-sky-600'     },
                  (log.wood_points      ?? 0) > 0 && { label: `+${log.wood_points}`,      icon: '🪵', cls: 'text-amber-700'   },
                ].filter(Boolean)

                return (
                  <div key={log.id} className="flex items-start gap-3 sm:gap-4 px-4 sm:px-6 py-4">
                    {/* Status dot */}
                    <div className="shrink-0 pt-2">
                      <div className={`w-2 h-2 rounded-full ${earned > 0 ? 'bg-amber-400' : 'bg-stone-300'}`} />
                    </div>
                    {/* Date */}
                    <div className="shrink-0 w-12 sm:w-14 text-right">
                      <p className="text-xs font-semibold text-stone-600">{dateStr}</p>
                      <p className="text-[10px] text-stone-400">{timeStr}</p>
                    </div>
                    {/* Text */}
                    <p className="flex-1 text-sm text-stone-700 leading-relaxed min-w-0">
                      {log.activity_text}
                    </p>
                    {/* Badges */}
                    <div className="shrink-0 flex flex-col items-end gap-1 ml-1">
                      {badges.length === 0 ? (
                        <span className="text-[10px] text-stone-400">no reward</span>
                      ) : badges.map((b, i) => (
                        <span key={i} className={`text-xs font-bold tabular-nums ${b.cls}`}>
                          {b.icon} {b.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}

function SectionHeader({ children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[11px] font-extrabold tracking-widest text-stone-400 uppercase whitespace-nowrap">
        {children}
      </h2>
      <div className="flex-1 h-px bg-stone-200" />
    </div>
  )
}

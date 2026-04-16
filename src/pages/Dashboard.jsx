import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Nav from '../components/Nav'

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [points, setPoints] = useState({ total: 0, buildings: 0, activities: 0 })

  // Activity log state
  const [activityText, setActivityText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [award, setAward] = useState(null)
  const [submitError, setSubmitError] = useState(null)

  // Recent activity logs
  const [activityLogs, setActivityLogs] = useState(null) // null = loading

  // City Advisor state
  const [advisorQuestion, setAdvisorQuestion] = useState('')
  const [advisorAdvice, setAdvisorAdvice] = useState(null)
  const [advisorLoading, setAdvisorLoading] = useState(false)
  const [advisorError, setAdvisorError] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate('/', { replace: true }); return }
      setUser(session.user)
      const [{ data: ud }, { data: logs }] = await Promise.all([
        supabase
          .from('user_data')
          .select('total_points, activities_count')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('activity_logs')
          .select('id, activity_text, food_points, knowledge_points, wood_points, total_points, logged_at')
          .eq('user_id', session.user.id)
          .order('logged_at', { ascending: false })
          .limit(20),
      ])
      if (ud) {
        setPoints(prev => ({
          ...prev,
          total: ud.total_points ?? 0,
          activities: ud.activities_count ?? 0,
        }))
      }
      setActivityLogs(logs ?? [])
    })
  }, [navigate])

  if (!user) return null

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.user_name ||
    user.email

  const initials = displayName
    ? displayName.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  async function handleSubmitActivity(e) {
    e.preventDefault()
    if (!activityText.trim() || submitting) return

    setSubmitting(true)
    setAward(null)
    setSubmitError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evaluate-activity`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ activityText: activityText.trim() }),
        }
      )
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status}: ${body}`)
      }
      const result = await res.json()
      setAward(result)

      // Prepend to recent activity list immediately
      setActivityLogs(prev => [{
        id: crypto.randomUUID(),
        activity_text: activityText.trim(),
        food_points:      result.food_points      ?? 0,
        knowledge_points: result.knowledge_points ?? 0,
        wood_points:      result.wood_points      ?? 0,
        total_points:     result.total_earned     ?? 0,
        logged_at: new Date().toISOString(),
      }, ...(prev ?? [])].slice(0, 20))

      setActivityText('')

      const { data } = await supabase
        .from('user_data')
        .select('total_points, activities_count')
        .eq('user_id', user.id)
        .maybeSingle()
      if (data) {
        setPoints(prev => ({
          ...prev,
          total: data.total_points ?? 0,
          activities: data.activities_count ?? 0,
        }))
      }
    } catch (err) {
      console.error(err)
      setSubmitError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAskAdvisor(e) {
    e.preventDefault()
    if (advisorLoading) return

    setAdvisorLoading(true)
    setAdvisorAdvice(null)
    setAdvisorError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/city-advisor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ question: advisorQuestion.trim() }),
        }
      )
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status}: ${body}`)
      }
      const result = await res.json()
      setAdvisorAdvice(result.advice)
      setAdvisorQuestion('')
    } catch (err) {
      console.error(err)
      setAdvisorError(err.message || 'The advisor is unavailable. Try again.')
    } finally {
      setAdvisorLoading(false)
    }
  }

  const statsRow = [
    { label: 'Total points',  value: String(points.total) },
    { label: 'Buildings',     value: '0' },
    { label: 'Activities',    value: String(points.activities) },
    { label: 'Day streak',    value: '0' },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Nav />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Welcome */}
        <section className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold shrink-0 select-none">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back, {displayName}
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">Your city is waiting for you.</p>
          </div>
        </section>

        {/* Stats row */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-12">
          {statsRow.map((s) => (
            <div
              key={s.label}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5"
            >
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{s.label}</p>
              <p className="text-2xl font-bold text-white">{s.value}</p>
            </div>
          ))}
        </section>

        {/* Enter city CTA */}
        <section className="mb-12">
          <Link
            to="/city"
            className="group flex items-center justify-between bg-slate-900 border border-slate-800 hover:border-indigo-700 rounded-2xl p-6 sm:p-8 transition-colors"
          >
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-1">Your city awaits</h2>
              <p className="text-slate-400 text-sm">Build, expand, and grow your empire.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-4xl">🏙️</span>
              <span className="bg-indigo-600 group-hover:bg-indigo-500 transition-colors text-white text-sm font-semibold px-5 py-2.5 rounded-xl whitespace-nowrap">
                Enter my City →
              </span>
            </div>
          </Link>
        </section>

        {/* Two-column row: City Advisor + Log an activity */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">

          {/* ── City Advisor ── */}
          <div className="bg-slate-900 border border-amber-900/40 rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-2.5 mb-1">
              <span className="text-xl">👑</span>
              <h2 className="text-lg font-semibold text-amber-300">City Advisor</h2>
            </div>
            <p className="text-slate-400 text-sm mb-5">
              Ask your advisor for a personalised wellness tip, or leave it blank for today's suggestion based on your history.
            </p>

            <form onSubmit={handleAskAdvisor} className="space-y-3 mb-4">
              <input
                type="text"
                value={advisorQuestion}
                onChange={(e) => setAdvisorQuestion(e.target.value)}
                placeholder="e.g. What should I eat today? (optional)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-600 transition-colors"
              />
              <button
                type="submit"
                disabled={advisorLoading}
                className="w-full px-5 py-2.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {advisorLoading ? 'Consulting the advisor…' : 'Ask Advisor'}
              </button>
            </form>

            {advisorError && (
              <p className="text-red-400 text-sm mb-3">{advisorError}</p>
            )}

            {advisorAdvice && (
              <div className="flex-1 bg-amber-950/30 border border-amber-900/40 rounded-xl p-4">
                <p className="text-amber-100 text-sm leading-relaxed">{advisorAdvice}</p>
              </div>
            )}

            {!advisorAdvice && !advisorError && (
              <div className="flex-1 flex items-center justify-center py-6">
                <p className="text-slate-600 text-sm italic text-center">
                  Your advisor awaits your question…
                </p>
              </div>
            )}
          </div>

          {/* ── Log an activity ── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-1">Log an activity</h2>
            <p className="text-slate-400 text-sm mb-5">
              Describe what you ate or did today. Claude will evaluate it and award resources to your city.
            </p>
            <form onSubmit={handleSubmitActivity} className="space-y-3">
              <textarea
                value={activityText}
                onChange={(e) => setActivityText(e.target.value)}
                placeholder="e.g. Ran 5km this morning, had a salad for lunch, meditated for 15 minutes..."
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors resize-none"
              />
              <button
                type="submit"
                disabled={submitting || !activityText.trim()}
                className="w-full px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {submitting ? 'Evaluating…' : 'Submit activity'}
              </button>
            </form>

            {submitError && (
              <p className="text-red-400 text-sm mt-3">{submitError}</p>
            )}

            {award && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                {award.total_earned === 0 ? (
                  <p className="text-slate-400 text-sm">{award.message}</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-300">{award.message}</p>
                    <div className="flex flex-wrap gap-2">
                      {award.food_points > 0 && (
                        <div className="flex items-center gap-1.5 bg-green-900/40 border border-green-800/50 rounded-lg px-3 py-1.5">
                          <span className="text-sm">🌾</span>
                          <span className="text-green-300 text-sm font-semibold">+{award.food_points} food</span>
                        </div>
                      )}
                      {award.knowledge_points > 0 && (
                        <div className="flex items-center gap-1.5 bg-blue-900/40 border border-blue-800/50 rounded-lg px-3 py-1.5">
                          <span className="text-sm">📚</span>
                          <span className="text-blue-300 text-sm font-semibold">+{award.knowledge_points} knowledge</span>
                        </div>
                      )}
                      {award.wood_points > 0 && (
                        <div className="flex items-center gap-1.5 bg-amber-900/40 border border-amber-800/50 rounded-lg px-3 py-1.5">
                          <span className="text-sm">🪵</span>
                          <span className="text-amber-300 text-sm font-semibold">+{award.wood_points} wood</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">Total earned: +{award.total_earned} points</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Recent activity */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Recent activity</h2>

          {activityLogs === null && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
              <p className="text-slate-500 text-sm">Loading…</p>
            </div>
          )}

          {activityLogs !== null && activityLogs.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
              <p className="text-slate-300 font-medium mb-1">No activities logged yet</p>
              <p className="text-slate-500 text-sm max-w-xs mx-auto">
                Submit your first activity above to start building your history.
              </p>
            </div>
          )}

          {activityLogs !== null && activityLogs.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800 overflow-hidden">
              {activityLogs.map((log) => {
                const date = new Date(log.logged_at)
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                const badges = []
                if (log.food_points      > 0) badges.push({ label: `+${log.food_points}`, icon: '🌾', cls: 'text-green-400' })
                if (log.knowledge_points > 0) badges.push({ label: `+${log.knowledge_points}`, icon: '📚', cls: 'text-blue-400' })
                if (log.wood_points      > 0) badges.push({ label: `+${log.wood_points}`, icon: '🪵', cls: 'text-amber-400' })

                return (
                  <div key={log.id} className="flex items-start gap-4 px-5 py-4">
                    {/* Date stamp */}
                    <div className="shrink-0 text-right w-14">
                      <p className="text-xs font-medium text-slate-300">{dateStr}</p>
                      <p className="text-xs text-slate-600">{timeStr}</p>
                    </div>

                    {/* Activity text */}
                    <p className="flex-1 text-sm text-slate-300 leading-relaxed pt-0.5">
                      {log.activity_text}
                    </p>

                    {/* Points badges */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {badges.length === 0 ? (
                        <span className="text-xs text-slate-600">no points</span>
                      ) : badges.map((b, i) => (
                        <span key={i} className={`text-xs font-semibold tabular-nums ${b.cls}`}>
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

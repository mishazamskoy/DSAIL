import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Landing() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/dashboard', { replace: true })
      else setLoading(false)
    })
  }, [navigate])

  async function handleSignIn() {
    setSigningIn(true)
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
  }

  if (loading) return null

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 border-b border-slate-800/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <span className="font-bold text-white tracking-tight text-lg">DSAIL</span>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          City-building strategy game
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-3xl leading-tight">
          Build your city.
          <br />
          <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            One healthy day
          </span>
          <br />
          at a time.
        </h1>

        <p className="mt-6 text-lg text-slate-400 max-w-lg leading-relaxed">
          Log your wellness activities in plain text. Claude AI rewards you with
          resources. Spend them to grow your empire.
        </p>

        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="mt-10 inline-flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/40"
        >
          <GitHubIcon />
          {signingIn ? 'Redirecting…' : 'Sign in with GitHub'}
        </button>

        <p className="mt-4 text-xs text-slate-600">Free to play · No credit card required</p>

        {/* Feature cards */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full text-left">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-colors"
            >
              <div className="text-2xl mb-4">{f.icon}</div>
              <h3 className="font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 py-6">
        <p className="text-center text-xs text-slate-600">© 2025 DSAIL. All rights reserved.</p>
      </footer>
    </div>
  )
}

const features = [
  {
    icon: '📋',
    title: 'Log activities',
    desc: 'Describe your workouts, meals, sleep, and wellness habits in plain, everyday text.',
  },
  {
    icon: '⚡',
    title: 'Earn resources',
    desc: 'Claude AI reads your logs and rewards you with building materials and city points.',
  },
  {
    icon: '🏙️',
    title: 'Build your city',
    desc: 'Spend your resources to construct buildings, unlock districts, and grow your empire.',
  },
]

function GitHubIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.13 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

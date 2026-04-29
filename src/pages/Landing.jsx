import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Landing() {
  const navigate = useNavigate()
  const [loading, setLoading]                 = useState(true)
  const [signingInGitHub, setSigningInGitHub] = useState(false)
  const [signingInGoogle, setSigningInGoogle] = useState(false)

  // Email auth state
  const [mode, setMode]           = useState('signin') // 'signin' | 'signup'
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState(null)
  const [signupDone, setSignupDone] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/dashboard', { replace: true })
      else setLoading(false)
    })
  }, [navigate])

  async function handleGitHubSignIn() {
    setSigningInGitHub(true)
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
  }

  async function handleGoogleSignIn() {
    setSigningInGoogle(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
  }

  async function handleEmailAuth(e) {
    e.preventDefault()
    setEmailError(null)
    setEmailBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        })
        if (error) throw error
        setSignupDone(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      setEmailError(err.message ?? 'Something went wrong.')
    } finally {
      setEmailBusy(false)
    }
  }

  const oauthBusy = signingInGitHub || signingInGoogle
  const signingIn = oauthBusy || emailBusy

  if (loading) return null

  return (
    <div className="min-h-screen bg-stone-950 text-white flex flex-col">

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-64 w-[600px] h-[600px] bg-amber-600/4 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[400px] bg-amber-700/4 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-sm">⚔</span>
            <span className="font-bold tracking-tight text-white text-sm">Health Realm</span>
          </div>
          <a
            href="#signin"
            className="text-sm text-stone-400 hover:text-white transition-colors"
          >
            Sign in →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 sm:px-8 py-16 sm:py-24 text-center">

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 mb-8 rounded-full bg-amber-500/8 border border-amber-500/15 text-amber-400 text-xs font-semibold tracking-widest uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Wellness · City-building · Strategy
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] max-w-3xl mx-auto">
          Build a city.
          <br />
          <span className="text-amber-400">Live better.</span>
        </h1>

        <p className="mt-6 text-stone-400 max-w-lg mx-auto leading-relaxed text-base sm:text-lg">
          Log your workouts, meals, and daily habits in plain text. Claude AI evaluates
          your day and awards resources to spend on your medieval city.
        </p>

        <div id="signin" className="mt-10 w-full max-w-sm mx-auto">

          {signupDone ? (
            <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-2xl p-6 text-center">
              <p className="text-2xl mb-3">📬</p>
              <p className="font-semibold text-emerald-300 text-sm mb-1">Check your email</p>
              <p className="text-stone-400 text-xs leading-relaxed">
                We sent a confirmation link to <span className="text-white font-medium">{email}</span>.
                Click it to activate your account and start playing.
              </p>
            </div>
          ) : (
            <div className="bg-white/4 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">

              {/* Mode tabs */}
              <div className="flex rounded-lg bg-white/5 p-0.5 mb-5">
                {['signin', 'signup'].map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setEmailError(null) }}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      mode === m ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {m === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>

              {/* OAuth buttons */}
              <div className="flex flex-col gap-2 mb-4">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                  className="flex items-center justify-center gap-2.5 bg-white hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed text-stone-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors w-full"
                >
                  <GoogleIcon />
                  {signingInGoogle ? 'Redirecting…' : 'Continue with Google'}
                </button>
                <button
                  onClick={handleGitHubSignIn}
                  disabled={signingIn}
                  className="flex items-center justify-center gap-2.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors w-full border border-white/10"
                >
                  <GitHubIcon />
                  {signingInGitHub ? 'Redirecting…' : 'Continue with GitHub'}
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-stone-600">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Email form */}
              <form onSubmit={handleEmailAuth} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={signingIn}
                  className="w-full bg-white/8 border border-white/12 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/60 focus:bg-white/10 transition disabled:opacity-50"
                />
                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={signingIn}
                  className="w-full bg-white/8 border border-white/12 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/60 focus:bg-white/10 transition disabled:opacity-50"
                />
                {emailError && (
                  <p className="text-red-400 text-xs">{emailError}</p>
                )}
                <button
                  type="submit"
                  disabled={signingIn || !email || !password}
                  className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-bold text-sm py-2.5 rounded-lg transition-colors"
                >
                  {emailBusy
                    ? (mode === 'signup' ? 'Creating account…' : 'Signing in…')
                    : (mode === 'signup' ? 'Create account' : 'Sign in')}
                </button>
              </form>

            </div>
          )}

          <p className="text-xs text-stone-600 text-center mt-3">Free · No credit card required</p>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 max-w-5xl mx-auto w-full px-5 sm:px-8 pb-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How it works</h2>
          <p className="text-stone-500 text-sm mt-2">Three steps to grow your empire</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {steps.map((step, i) => (
            <div key={step.title}
              className="bg-white/3 border border-white/8 rounded-2xl p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-2xl leading-none">{step.icon}</span>
              </div>
              <h3 className="font-semibold text-white text-sm mb-2">{step.title}</h3>
              <p className="text-sm text-stone-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Resources */}
      <section className="relative z-10 max-w-5xl mx-auto w-full px-5 sm:px-8 pb-24">
        <div className="rounded-2xl border border-white/8 overflow-hidden">
          <div className="px-6 py-5 border-b border-white/8 bg-white/3">
            <h2 className="font-semibold text-white text-sm">Resources you can earn</h2>
            <p className="text-stone-500 text-xs mt-1">Healthy habits translate directly into building materials</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/8">
            {resources.map(r => (
              <div key={r.name} className="px-6 py-6 bg-white/[0.02]">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl leading-none">{r.icon}</span>
                  <span className={`text-sm font-bold ${r.color}`}>{r.name}</span>
                </div>
                <p className="text-xs text-stone-500 leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-xs">⚔</span>
            <span className="text-sm font-semibold text-stone-500">Health Realm</span>
          </div>
          <p className="text-xs text-stone-700">© {new Date().getFullYear()} Health Realm</p>
        </div>
      </footer>

    </div>
  )
}

const steps = [
  {
    icon: '📝',
    title: 'Log your day',
    desc: 'Describe your exercise, meals, sleep, or any wellness activity in natural language.',
  },
  {
    icon: '🤖',
    title: 'Get rewarded',
    desc: 'Claude AI evaluates your log and awards Food, Knowledge, and Wood resources.',
  },
  {
    icon: '🏰',
    title: 'Grow your city',
    desc: 'Spend resources to construct buildings, expand territory, and advance your empire.',
  },
]

const resources = [
  {
    icon: '🍎',
    name: 'Food',
    desc: 'Earned through healthy eating, home cooking, and nutrition-focused habits.',
    color: 'text-emerald-400',
  },
  {
    icon: '📚',
    name: 'Knowledge',
    desc: 'Earned through reading, learning, meditation, and mental wellness practices.',
    color: 'text-sky-400',
  },
  {
    icon: '🪵',
    name: 'Wood',
    desc: 'Earned through physical exercise, movement, sport, and outdoor activities.',
    color: 'text-amber-400',
  },
]

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.13 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

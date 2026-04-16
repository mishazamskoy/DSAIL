import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Nav() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/dashboard" className="font-bold text-white tracking-tight text-lg">
          DSAIL
        </Link>
        <nav className="flex items-center gap-0.5">
          <Link
            to="/dashboard"
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            Dashboard
          </Link>
          <Link
            to="/profile"
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            Profile
          </Link>
          <button
            onClick={handleSignOut}
            className="ml-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  )
}

import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Nav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  const links = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/profile',   label: 'Profile'   },
  ]

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
          <span className="text-amber-500 text-sm leading-none">⚔</span>
          <span className="font-bold text-stone-900 tracking-tight text-sm">Health Realm</span>
        </Link>

        <nav className="flex items-center gap-0.5">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === to
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={handleSignOut}
            className="ml-2 px-3 py-1.5 text-sm font-medium text-stone-500 hover:text-stone-900 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </nav>

      </div>
    </header>
  )
}

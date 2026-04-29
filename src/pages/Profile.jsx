import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Nav from '../components/Nav'

export default function Profile() {
  const navigate = useNavigate()
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [savedRow, setSavedRow] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState(null)
  const [form, setForm] = useState({ user_name: '', 'e-mail_address': '', birth_date: '' })

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/', { replace: true }); return }
      setUser(session.user)

      const { data } = await supabase
        .from('user_data')
        .select('id, user_name, "e-mail_address", birth_date')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (data) {
        setSavedRow(data)
        setForm({
          user_name:         data.user_name          ?? '',
          'e-mail_address':  data['e-mail_address']  ?? '',
          birth_date:        data.birth_date          ?? '',
        })
      }
      setLoading(false)
    }
    load()
  }, [navigate])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    setSuccess(false)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setSuccess(false); setError(null)

    const payload = {
      user_name:        form.user_name         || null,
      'e-mail_address': form['e-mail_address'] || null,
      birth_date:       form.birth_date        || null,
      updated_at: new Date().toISOString(),
    }

    if (savedRow) {
      const { error: err } = await supabase.from('user_data').update(payload).eq('id', savedRow.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data, error: err } = await supabase
        .from('user_data')
        .insert({ ...payload, user_id: user.id })
        .select('id, user_name, "e-mail_address", birth_date')
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      setSavedRow(data)
    }

    setSuccess(true)
    setSaving(false)
  }

  if (loading) return null

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.user_name ||
    user.email

  const initials = displayName
    ? displayName.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const avatarUrl   = user.user_metadata?.avatar_url
  const githubLogin = user.user_metadata?.user_name

  return (
    <div className="min-h-screen bg-stone-100">
      <Nav />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-lg space-y-6">

          {/* Header */}
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName}
                className="w-14 h-14 rounded-full shrink-0 ring-2 ring-white shadow-sm" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-amber-100 border-2 border-white shadow-sm flex items-center justify-center text-base font-bold text-amber-700 shrink-0 select-none">
                {initials}
              </div>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">{displayName}</h1>
              {githubLogin && (
                <p className="text-stone-400 text-sm mt-0.5">@{githubLogin} · GitHub</p>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 sm:p-8">
            <h2 className="text-sm font-bold text-stone-900 mb-0.5">Personal information</h2>
            <p className="text-stone-500 text-sm mb-6">Update your profile details below.</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="Name" htmlFor="user_name">
                <input
                  id="user_name" name="user_name" type="text"
                  value={form.user_name}
                  onChange={handleChange}
                  placeholder="Your full name"
                  className="input"
                />
              </Field>

              <Field label="Email address" htmlFor="e-mail_address">
                <input
                  id="e-mail_address" name="e-mail_address" type="email"
                  value={form['e-mail_address']}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="input"
                />
              </Field>

              <Field label="Birthdate" htmlFor="birth_date">
                <input
                  id="birth_date" name="birth_date" type="date"
                  value={form.birth_date}
                  onChange={handleChange}
                  className="input"
                />
              </Field>

              {success && (
                <p className="text-sm text-emerald-600 flex items-center gap-1.5">
                  <span>✓</span> Profile saved successfully.
                </p>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-stone-950 font-bold text-sm px-6 py-2.5 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                {saving ? 'Saving…' : savedRow ? 'Update profile' : 'Save profile'}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  )
}

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-stone-700 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

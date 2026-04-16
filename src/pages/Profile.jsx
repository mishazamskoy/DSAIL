import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Nav from '../components/Nav'

export default function Profile() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedRow, setSavedRow] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
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
          user_name: data.user_name ?? '',
          'e-mail_address': data['e-mail_address'] ?? '',
          birth_date: data.birth_date ?? '',
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
    setSaving(true)
    setSuccess(false)
    setError(null)

    const payload = {
      user_name: form.user_name || null,
      'e-mail_address': form['e-mail_address'] || null,
      birth_date: form.birth_date || null,
      updated_at: new Date().toISOString(),
    }

    if (savedRow) {
      const { error: err } = await supabase
        .from('user_data')
        .update(payload)
        .eq('id', savedRow.id)
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

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Nav />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="max-w-lg">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Profile</h1>
          <p className="text-slate-400 text-sm mb-8">Update your personal information.</p>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="Name" htmlFor="user_name">
                <input
                  id="user_name"
                  name="user_name"
                  type="text"
                  value={form.user_name}
                  onChange={handleChange}
                  placeholder="Your full name"
                  className="input"
                />
              </Field>

              <Field label="E-mail address" htmlFor="e-mail_address">
                <input
                  id="e-mail_address"
                  name="e-mail_address"
                  type="email"
                  value={form['e-mail_address']}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="input"
                />
              </Field>

              <Field label="Birthdate" htmlFor="birth_date">
                <input
                  id="birth_date"
                  name="birth_date"
                  type="date"
                  value={form.birth_date}
                  onChange={handleChange}
                  className="input"
                />
              </Field>

              {success && (
                <p className="text-sm text-emerald-400 flex items-center gap-1.5">
                  <span>✓</span> Profile saved successfully.
                </p>
              )}
              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-300 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

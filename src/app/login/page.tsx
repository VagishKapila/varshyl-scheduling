'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Registration failed'); setLoading(false); return }
      }
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) { setError('Invalid email or password'); setLoading(false); return }
      router.push('/')
      router.refresh()
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl" style={{background:'linear-gradient(135deg,#f15a24 0 45%,#111 45% 68%,#ffc400 68%)'}} />
          <span className="font-black text-xl text-gray-900">Varshyl Scheduling</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            {mode === 'login' ? 'Sign in to your scheduling workspace' : 'Start building construction schedules'}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Full Name</label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  autoComplete="name"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="John Smith" required
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="you@company.com" required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="••••••••" required minLength={6}
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full py-3 rounded-lg font-bold text-white text-sm mt-2 disabled:opacity-60 transition-all"
              style={{background:'#f15a24'}}
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
              className="font-semibold text-orange-500 hover:underline">
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

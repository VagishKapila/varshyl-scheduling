'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function OnboardingPage() {
  const router = useRouter()
  const { update } = useSession()
  const [companyName, setCompanyName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [footerText, setFooterText] = useState('COMPANY CONFIDENTIAL | For project coordination only. Schedule is a living document and may change due to permitting, inspections, owner decisions, material availability, weather, or field conditions.')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setLogoUrl('')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => {
      console.error('[onboarding] logo read failed')
      setError('Could not read logo file. You can continue without a logo.')
      setLogoUrl('')
    }
    reader.onload = ev => setLogoUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!companyName.trim()) {
      setError('Company name is required')
      return
    }
    setLoading(true)
    try {
      const payload: { companyName: string; footerText: string; logoUrl?: string } = {
        companyName: companyName.trim(),
        footerText,
      }
      if (logoUrl) payload.logoUrl = logoUrl

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      let data: { error?: string } = {}
      try {
        data = await res.json()
      } catch (parseErr) {
        console.error('[onboarding] failed to parse response', parseErr)
        setError('Unexpected server response. Please try again.')
        return
      }

      if (!res.ok) {
        const message = data.error || 'Failed to save company'
        console.error('[onboarding] submit failed', res.status, message)
        setError(message)
        return
      }

      await update()
      router.push('/')
      router.refresh()
    } catch (err) {
      console.error('[onboarding] submit error', err)
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl" style={{background:'linear-gradient(135deg,#f15a24 0 45%,#111 45% 68%,#ffc400 68%)'}} />
          <span className="font-black text-xl text-gray-900">Varshyl Scheduling</span>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h1 className="text-2xl font-bold mb-1">Set up your company</h1>
          <p className="text-gray-500 text-sm mb-6">This will appear on all your schedule PDFs</p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Company Name *</label>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                autoComplete="organization"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Acme Construction Inc."
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Company Logo <span className="font-normal normal-case text-gray-400">(optional)</span></label>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-600"
              />
              {logoUrl && <img src={logoUrl} alt="Logo preview" className="mt-3 h-14 object-contain rounded border border-gray-200 p-2" />}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Schedule Footer Text</label>
              <textarea
                value={footerText}
                onChange={e => setFooterText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-bold text-white text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              style={{background:'#f15a24'}}
            >
              {loading && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
              )}
              {loading ? 'Setting up…' : 'Continue to Dashboard →'}
            </button>
            {error && (
              <p className="text-sm text-red-600 text-center" role="alert">{error}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

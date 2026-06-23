'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const PROJECT_TYPES = [
  { value: 'commercial-ti', label: 'Commercial TI' },
  { value: 'office-renovation', label: 'Office Renovation' },
  { value: 'retail', label: 'Retail Buildout' },
  { value: 'medical', label: 'Medical/Dental Office' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'industrial', label: 'Industrial/Warehouse' },
  { value: 'custom', label: 'Custom / Other' },
]

const PERMIT_STATUSES = [
  { value: 'standard', label: 'Standard Permit' },
  { value: 'expedited', label: 'Expedited / Over-the-Counter' },
  { value: 'no-permit', label: 'No Permit Required' },
  { value: 'emergency', label: 'Emergency / Verbal OK' },
]

export default function NewProjectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '', clientName: '', address: '', projectType: 'commercial-ti',
    startDate: '', targetEndDate: '', permitStatus: 'standard',
    permitDays: 15, saturdayWork: false, doubleShift: false,
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.clientName || !form.startDate) { setError('Fill required fields'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); setLoading(false); return }
      router.push(`/projects/${data.data.id}/template?start=${form.startDate}&saturdayWork=${form.saturdayWork}&permitStatus=${form.permitStatus}&permitDays=${form.permitDays}`)
    } catch { setError('Something went wrong'); setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 no-print">
        <Link href="/" className="text-gray-400 hover:text-gray-700 text-sm">← Dashboard</Link>
        <span className="text-gray-300">|</span>
        <h1 className="font-bold text-gray-900">New Project</h1>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-900 text-base mb-2">Project Details</h2>
              {[
                { label: 'Project Name *', key: 'name', placeholder: 'Acme Corp Suite 200 TI' },
                { label: 'Client Name *', key: 'clientName', placeholder: 'Acme Corporation' },
                { label: 'Address', key: 'address', placeholder: '123 Main St, Los Angeles CA 90001' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">{f.label}</label>
                  <input value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Project Type</label>
                <select value={form.projectType} onChange={e => set('projectType', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Start Date *</label>
                  <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Target End Date</label>
                  <input type="date" value={form.targetEndDate} onChange={e => set('targetEndDate', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>
            </div>

            {/* RIGHT */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-900 text-base mb-2">Schedule Settings</h2>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Permit Status</label>
                <select value={form.permitStatus} onChange={e => set('permitStatus', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  {PERMIT_STATUSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                {['no-permit','emergency'].includes(form.permitStatus) && (
                  <p className="text-xs text-orange-600 mt-1 font-medium">⚠ City review tasks will be disabled in the template</p>
                )}
              </div>
              {!['no-permit','emergency'].includes(form.permitStatus) && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Permit / City Review Days</label>
                  <input type="number" min={1} max={120} value={form.permitDays} onChange={e => set('permitDays', Number(e.target.value))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              )}
              <div className="space-y-3 pt-2">
                {[
                  { key: 'saturdayWork', label: 'Saturday Work', desc: 'Count Saturdays as working days' },
                  { key: 'doubleShift', label: 'Double Shift', desc: 'Accelerated schedule with double shifts' },
                ].map(tog => (
                  <label key={tog.key} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                    <div>
                      <div className="font-semibold text-sm text-gray-800">{tog.label}</div>
                      <div className="text-xs text-gray-500">{tog.desc}</div>
                    </div>
                    <div className={`w-12 h-6 rounded-full transition-all relative ${(form as any)[tog.key] ? 'bg-orange-500' : 'bg-gray-200'}`}
                      onClick={() => set(tog.key, !(form as any)[tog.key])}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${(form as any)[tog.key] ? 'left-7' : 'left-1'}`} />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button type="submit" disabled={loading}
              className="px-8 py-3 rounded-lg font-bold text-white text-sm disabled:opacity-60 transition-all"
              style={{background:'#f15a24'}}>
              {loading ? 'Creating…' : 'Next: Select Template →'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

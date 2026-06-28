'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { parseDate, fmtInput } from '@/lib/dates'

export default function ProjectPage() {
  const params = useParams()
  const id = params.id as string
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [editForm, setEditForm] = useState({
    startDate: '',
    targetEndDate: '',
    saturdayWork: false,
  })

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(d => {
        setProject(d.data)
        if (d.data) {
          setEditForm({
            startDate: fmtInput(parseDate(d.data.startDate)),
            targetEndDate: fmtInput(parseDate(d.data.targetEndDate)),
            saturdayWork: Boolean(d.data.saturdayWork),
          })
        }
        setLoading(false)
      })
  }, [id])

  function handleDateChange(field: 'startDate' | 'targetEndDate', value: string) {
    try {
      setEditError('')
      setEditForm(f => ({ ...f, [field]: value }))
    } catch {
      setEditError('Invalid date')
    }
  }

  async function saveProjectEdits() {
    setSaving(true)
    setEditError('')
    try {
      const prevStart = project ? fmtInput(parseDate(project.startDate)) : ''
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditError(data.error || 'Failed to save')
        setSaving(false)
        return
      }
      if (editForm.startDate !== prevStart) {
        await fetch(`/api/projects/${id}/recalculate-all`, { method: 'POST' })
      }
      const refreshed = await fetch(`/api/projects/${id}`).then(r => r.json())
      setProject(refreshed.data)
      setEditing(false)
    } catch {
      setEditError('Something went wrong saving project')
    }
    setSaving(false)
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading…</div>
  if (!project) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Project not found</div>

  const currentRevision = project.revisions?.find((r: any) => r.isCurrent)
  const allRevisions = [...(project.revisions || [])].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-gray-700 text-sm">← Dashboard</Link>
        <span className="text-gray-300">|</span>
        <h1 className="font-bold text-gray-900">{project.name}</h1>
        <span className="text-gray-400 text-sm">— {project.clientName}</span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-900">Project Info</h2>
              {!editing ? (
                <button onClick={() => setEditing(true)} className="text-xs font-semibold text-orange-600 hover:text-orange-700">
                  Edit dates
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(false); setEditError('') }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  <button onClick={saveProjectEdits} disabled={saving} className="text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            {editError && <p className="text-xs text-red-600 mb-2">{editError}</p>}
            {[
              ['Address', project.address],
              ['Type', project.projectType],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                <span className="text-gray-500">{k}</span>
                <span className="font-medium text-gray-900">{v}</span>
              </div>
            ))}
            {editing ? (
              <>
                <div className="py-2 border-b border-gray-100">
                  <label className="block text-xs text-gray-500 mb-1">Start</label>
                  <input type="date" value={editForm.startDate}
                    onChange={e => handleDateChange('startDate', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <div className="py-2 border-b border-gray-100">
                  <label className="block text-xs text-gray-500 mb-1">Target End</label>
                  <input type="date" value={editForm.targetEndDate}
                    onChange={e => handleDateChange('targetEndDate', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <label className="flex items-center justify-between py-2 border-b border-gray-100 text-sm cursor-pointer">
                  <span className="text-gray-500">Saturday Work</span>
                  <input type="checkbox" checked={editForm.saturdayWork}
                    onChange={e => setEditForm(f => ({ ...f, saturdayWork: e.target.checked }))}
                    className="w-4 h-4 accent-orange-500" />
                </label>
              </>
            ) : (
              [
                ['Start', format(parseDate(project.startDate), 'MMM d, yyyy')],
                ['Target End', format(parseDate(project.targetEndDate), 'MMM d, yyyy')],
                ['Permit', project.permitStatus],
                ['Saturday Work', project.saturdayWork ? 'Yes' : 'No'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium text-gray-900">{v}</span>
                </div>
              ))
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">Revisions</h2>
            {allRevisions.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">No revisions yet</div>
            ) : (
              <div className="space-y-2">
                {allRevisions.map((r: any) => (
                  <Link key={r.id} href={`/projects/${id}/schedule/${r.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50 cursor-pointer">
                      <div>
                        <div className="font-semibold text-sm text-gray-900">{r.revisionName}</div>
                        <div className="text-xs text-gray-500">{format(new Date(r.createdAt), 'MMM d, yyyy h:mm a')}</div>
                      </div>
                      {r.isCurrent && <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full font-semibold">Current</span>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          {currentRevision ? (
            <Link href={`/projects/${id}/schedule/${currentRevision.id}`}>
              <button className="px-6 py-3 rounded-lg font-bold text-white" style={{background:'#f15a24'}}>
                Open Current Schedule →
              </button>
            </Link>
          ) : (
            <Link href={`/projects/${id}/template`}>
              <button className="px-6 py-3 rounded-lg font-bold text-white" style={{background:'#f15a24'}}>
                Create Schedule →
              </button>
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}

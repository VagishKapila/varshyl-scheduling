'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const COLOR_LABELS: Record<string,string> = {
  blue: '#2458ff', red: '#d71920', green: '#138a36',
  teal: '#168c9a', purple: '#7a3cff', black: '#111',
}

export default function TemplatePage() {
  const router = useRouter()
  const params = useParams()
  const search = useSearchParams()
  const projectId = params.id as string
  const permitStatus = search.get('permitStatus') || 'standard'
  const isNoPermit = ['no-permit','emergency'].includes(permitStatus)

  const [template, setTemplate] = useState<any>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [durations, setDurations] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then(data => {
        const t = data.data?.[0]
        if (t) {
          setTemplate(t)
          const sel = new Set<string>()
          const dur: Record<string,number> = {}
          t.tasks.forEach((task: any) => {
            if (!(isNoPermit && task.isPermitRelated)) sel.add(task.id)
            dur[task.id] = task.defaultDurationDays
          })
          setSelected(sel)
          setDurations(dur)
        }
        setLoading(false)
      })
  }, [])

  function toggleTask(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function selectAll() {
    if (!template) return
    const sel = new Set<string>()
    template.tasks.forEach((t: any) => { if (!(isNoPermit && t.isPermitRelated)) sel.add(t.id) })
    setSelected(sel)
  }

  async function generateSchedule() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          selectedTaskIds: Array.from(selected),
          revisionName: 'Rev 1',
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed'); setGenerating(false); return }
      router.push(`/projects/${projectId}/schedule/${data.data.revision.id}`)
    } catch { alert('Failed to generate'); setGenerating(false) }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading template…</div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-10 no-print">
        <Link href={`/projects/${projectId}`} className="text-gray-400 hover:text-gray-700 text-sm">← Back</Link>
        <span className="text-gray-300">|</span>
        <h1 className="font-bold text-gray-900">Select Schedule Tasks</h1>
        <span className="ml-auto text-sm text-gray-500">{selected.size} of {template?.tasks?.length || 0} tasks selected</span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 pb-32">
        {/* Toolbar */}
        <div className="flex gap-2 flex-wrap mb-4">
          {[
            { label: 'Select All', action: selectAll },
            { label: 'Unselect All', action: () => setSelected(new Set()) },
          ].map(b => (
            <button key={b.label} onClick={b.action}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 font-semibold text-gray-700">
              {b.label}
            </button>
          ))}
          {isNoPermit && (
            <span className="px-3 py-1.5 text-sm bg-orange-50 text-orange-700 border border-orange-200 rounded-lg font-semibold">
              ⚠ Permit tasks auto-disabled
            </span>
          )}
        </div>

        {/* Task list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 grid grid-cols-12 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-1"></div>
            <div className="col-span-7">Task Name</div>
            <div className="col-span-2 text-center">Days</div>
            <div className="col-span-2 text-center">Color</div>
          </div>
          {template?.tasks?.map((task: any) => {
            const disabled = isNoPermit && task.isPermitRelated
            const isChecked = selected.has(task.id)
            return (
              <div key={task.id}
                className={`px-4 py-3 border-b border-gray-100 grid grid-cols-12 items-center ${disabled ? 'opacity-40' : 'hover:bg-gray-50'}`}>
                <div className="col-span-1">
                  <input type="checkbox" checked={isChecked && !disabled} disabled={disabled}
                    onChange={() => !disabled && toggleTask(task.id)}
                    className="rounded" />
                </div>
                <div className="col-span-7 text-sm font-medium text-gray-800"
                  style={{ paddingLeft: (task.level - 1) * 16 }}>
                  {task.name}
                  {task.isPermitRelated && <span className="ml-2 text-xs text-red-500 font-semibold">PERMIT</span>}
                  {task.isMilestone && <span className="ml-2 text-xs text-purple-500 font-semibold">◆ MILESTONE</span>}
                </div>
                <div className="col-span-2 flex justify-center">
                  <input type="number" min={1} max={120}
                    value={durations[task.id] || task.defaultDurationDays}
                    onChange={e => setDurations(d => ({ ...d, [task.id]: Number(e.target.value) }))}
                    disabled={!isChecked || disabled}
                    className="w-14 text-center px-2 py-1 border border-gray-200 rounded text-sm disabled:opacity-40" />
                </div>
                <div className="col-span-2 flex justify-center">
                  <div className="w-5 h-5 rounded-full" style={{ background: COLOR_LABELS[task.color] || '#2458ff' }} />
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* Sticky bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-between items-center no-print">
        <Link href={`/projects/${projectId}`}>
          <button className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700">← Back</button>
        </Link>
        <button onClick={generateSchedule} disabled={generating || selected.size === 0}
          className="px-8 py-3 rounded-lg font-bold text-white text-sm disabled:opacity-60"
          style={{background:'#f15a24'}}>
          {generating ? 'Generating…' : `Generate Schedule (${selected.size} tasks) →`}
        </button>
      </div>
    </div>
  )
}

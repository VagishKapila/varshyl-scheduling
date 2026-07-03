'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { format, differenceInCalendarDays, addDays, startOfWeek, startOfDay } from 'date-fns'
import { parseDate, fmt } from '@/lib/dates'

const COLOR_MAP: Record<string, string> = {
  blue: '#2458ff', red: '#d71920', green: '#138a36',
  teal: '#168c9a', purple: '#7a3cff', black: '#111',
}
const COL_PX = 18

type LookAheadEntry = {
  trade?: string | null
  constraints?: string | null
  inspections?: string | null
  materials?: string | null
}

function LookAheadCell({
  taskId,
  field,
  value,
  placeholder = '—',
  onSaved,
}: {
  taskId: string
  field: keyof LookAheadEntry
  value: string
  placeholder?: string
  onSaved: (taskId: string, field: keyof LookAheadEntry, val: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setDraft(value)
  }, [value])

  async function save() {
    setEditing(false)
    if (draft === value) return
    await fetch(`/api/lookahead/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: draft }),
    })
    onSaved(taskId, field, draft)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        className="w-full text-xs border border-orange-300 rounded px-1 py-0.5 no-print"
        style={{ fontSize: 9 }}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="no-print cursor-text block min-h-[14px]"
      title="Click to edit"
    >
      {value || placeholder}
    </span>
  )
}

export default function PrintPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const revisionId = params.revisionId as string
  const [revision, setRevision] = useState<any>(null)
  const [lookahead, setLookahead] = useState<Record<string, LookAheadEntry>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const loadData = useCallback(async (revId: string) => {
    const [revRes, laRes] = await Promise.all([
      fetch(`/api/revisions/${revId}`),
      fetch(`/api/revisions/${revId}/lookahead`),
    ])
    const revData = await revRes.json()
    if (!revRes.ok || !revData.data) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const laData = await laRes.json()
    setRevision(revData.data)
    setLookahead(laData.data || {})
    setNotFound(false)
    setLoading(false)
  }, [])

  useEffect(() => {
    async function resolveAndLoad() {
      if (revisionId === 'latest') {
        const res = await fetch(`/api/projects/${projectId}`)
        const data = await res.json()
        const current = data.data?.revisions?.find((r: any) => r.isCurrent)
          ?? data.data?.revisions?.[0]
        if (current?.id) {
          router.replace(`/projects/${projectId}/schedule/${current.id}/print`)
          return
        }
        setNotFound(true)
        setLoading(false)
        return
      }
      await loadData(revisionId)
    }
    resolveAndLoad()
  }, [revisionId, projectId, router, loadData])

  function onLookaheadSaved(taskId: string, field: keyof LookAheadEntry, val: string) {
    setLookahead(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], [field]: val || null },
    }))
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (notFound || !revision) return <div className="p-8 text-red-500">Revision not found</div>

  const tasks = [...(revision.tasks || [])].sort((a: any, b: any) => a.sortOrder - b.sortOrder)
  const project = revision.project
  const company = project?.company
  const today = startOfDay(new Date())

  function taskInLookahead(t: any): boolean {
    const s = parseDate(t.startDate)
    const f = parseDate(t.finishDate)
    const twoWeekCutoff = startOfDay(addDays(today, 14))
    return (
      (s >= today && s <= twoWeekCutoff) ||
      (f >= today && f <= twoWeekCutoff) ||
      (s <= today && f >= today)
    )
  }

  const twoWeekCutoff = startOfDay(addDays(today, 14))
  const lookaheadTasks = tasks.filter(taskInLookahead)
  const showInspections = !['no-permit', 'emergency'].includes(project?.permitStatus ?? '')

  const showLookAhead = searchParams.get('lookahead') !== 'false'
  const showSchedule = searchParams.get('schedule') !== 'false'

  const minDate = tasks.length
    ? new Date(Math.min(...tasks.map((t: any) => parseDate(t.startDate).getTime())))
    : today
  const maxDate = tasks.length
    ? new Date(Math.max(...tasks.map((t: any) => parseDate(t.finishDate).getTime())))
    : addDays(today, 90)
  const ganttStart = startOfWeek(addDays(minDate, -7))
  const ganttEnd = addDays(maxDate, 14)

  function dayOffset(date: Date | string) {
    return differenceInCalendarDays(parseDate(date), ganttStart)
  }

  const weeks: Date[] = []
  let cur = new Date(ganttStart)
  while (cur <= ganttEnd) {
    weeks.push(new Date(cur))
    cur = addDays(cur, 7)
  }

  const lookaheadHeaders = [
    'Task',
    'Trade / Responsible',
    'Start',
    'Finish',
    'Constraints / Notes',
    ...(showInspections ? ['Inspections'] : []),
    'Materials',
  ]

  return (
    <div style={{ fontFamily: 'Arial,sans-serif', fontSize: 10, color: '#111', background: 'white', padding: '0.35in' }}>
      <div className="no-print mb-4 flex gap-3 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
        <Link href={`/projects/${projectId}/schedule/${revisionId}`} className="text-sm text-gray-600 hover:underline">← Back to Gantt</Link>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.print()} className="px-4 py-2 rounded-lg text-white text-sm font-bold" style={{ background: '#111' }}>🖨 Print PDF</button>
          <button onClick={() => {
            const url = new URL(window.location.href)
            url.searchParams.set('lookahead', '1')
            window.open(url.toString(), '_blank')
          }} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold">Print 2-Week Look-Ahead</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {company?.logoUrl && <img src={company.logoUrl} alt="Logo" style={{ height: 48, objectFit: 'contain' }} />}
          <div>
            <div style={{ fontWeight: 900, fontSize: 14 }}>{company?.name}</div>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{project?.name}</div>
            <div style={{ fontSize: 10, color: '#444' }}>{project?.clientName} — {project?.address}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10, color: '#444' }}>
          <div style={{ fontWeight: 700 }}>Schedule Revision: {revision.revisionName}</div>
          <div>Date Issued: {format(today, 'MMM d, yyyy')}</div>
          <div>Start: {format(parseDate(project.startDate), 'MMM d, yyyy')}</div>
          <div>Target End: {format(parseDate(project.targetEndDate), 'MMM d, yyyy')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, fontSize: 9 }}>
        {showSchedule && Object.entries({ blue: 'Construction', red: 'Inspection/Hold/City', green: 'Owner/Client', teal: 'Contingency', purple: 'Procurement', black: 'Phase Summary' }).map(([c, l]) => (
          <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_MAP[c], display: 'inline-block' }} />
            {l}
          </span>
        ))}
      </div>

      {showSchedule && (
      <div style={{ border: '1px solid #111', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ display: 'flex', background: '#f2f4f7', borderBottom: '1px solid #ccc', height: 28 }}>
          <div style={{ width: 420, flexShrink: 0, borderRight: '1px solid #ccc', display: 'flex', alignItems: 'center', paddingLeft: 6, fontSize: 9, fontWeight: 700, color: '#475467', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span style={{ width: 20 }}>#</span>
            <span style={{ flex: 1 }}>Task Name</span>
            <span style={{ width: 36, textAlign: 'center' }}>Days</span>
            <span style={{ width: 56 }}>Start</span>
            <span style={{ width: 56 }}>Finish</span>
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {weeks.map((w, i) => (
              <div key={i} style={{ position: 'absolute', left: dayOffset(w) * COL_PX + 2, top: 8, fontSize: 8, color: '#667085', fontWeight: 600 }}>
                {format(w, 'M/d')}
              </div>
            ))}
            <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: '#f15a24', left: dayOffset(today) * COL_PX }} />
          </div>
        </div>

        {tasks.map((task: any, i: number) => {
          const isPhase = task.level === 0
          const dur = task.durationDays
          const barW = task.isMilestone ? 8 : Math.max(dur * COL_PX - 2, 4)
          const barColor = COLOR_MAP[task.color] || '#2458ff'
          const indent = task.level * 14

          return (
            <div key={task.id} style={{
              display: 'flex', borderBottom: '1px solid #eaecf0',
              height: 22, background: isPhase ? '#f8f9fb' : 'white',
            }}>
              <div style={{ width: 420, flexShrink: 0, borderRight: '1px solid #eaecf0', display: 'flex', alignItems: 'center',
                paddingLeft: 6 + indent, fontSize: 9, color: isPhase ? '#111' : '#344054', fontWeight: isPhase ? 700 : 400 }}>
                <span style={{ width: 20, color: '#98a2b3', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.isMilestone && <span style={{ color: barColor, marginRight: 2 }}>◆</span>}{task.name}
                </span>
                <span style={{ width: 36, textAlign: 'center', flexShrink: 0 }}>{task.durationDays}d</span>
                <span style={{ width: 56, flexShrink: 0 }}>{fmt(parseDate(task.startDate))}</span>
                <span style={{ width: 56, flexShrink: 0 }}>{fmt(parseDate(task.finishDate))}</span>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {weeks.map((_, wi) => (
                  <div key={wi} style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: '#f0f0f0', left: dayOffset(weeks[wi]) * COL_PX }} />
                ))}
                <div style={{ position: 'absolute', top: 0, bottom: 0, width: 1.5, background: '#f15a24', opacity: 0.5, left: dayOffset(today) * COL_PX }} />
                {task.isMilestone ? (
                  <div style={{ position: 'absolute', left: dayOffset(task.startDate) * COL_PX + 3, top: 6,
                    width: 10, height: 10, background: barColor, transform: 'rotate(45deg)' }} />
                ) : (
                  <div style={{
                    position: 'absolute',
                    left: dayOffset(task.startDate) * COL_PX + 1,
                    top: isPhase ? 9 : 6,
                    width: barW,
                    height: isPhase ? 4 : 10,
                    background: barColor,
                    borderRadius: 2,
                  }} />
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}

      {showLookAhead && (
      <div style={{ marginTop: showSchedule ? 24 : 0, pageBreakBefore: showSchedule ? 'always' : 'auto' }}>
        <div style={{ fontWeight: 900, fontSize: 13, borderBottom: '2px solid #111', paddingBottom: 4, marginBottom: 10 }}>
          2-Week Look-Ahead — {format(today, 'MMM d')} to {format(twoWeekCutoff, 'MMM d, yyyy')}
        </div>
        <p className="no-print text-xs text-gray-500 mb-2">Click any cell in Trade, Constraints, Inspections, or Materials to add notes. Values are saved per task.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
          <thead>
            <tr style={{ background: '#f2f4f7' }}>
              {lookaheadHeaders.map(h => (
                <th key={h} style={{ border: '1px solid #d0d5dd', padding: '4px 6px', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', fontSize: 8, letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lookaheadTasks.length === 0 ? (
              <tr><td colSpan={lookaheadHeaders.length} style={{ padding: '12px 6px', textAlign: 'center', color: '#667085' }}>No tasks in the next 2 weeks</td></tr>
            ) : lookaheadTasks.map((t: any) => {
              const entry = lookahead[t.id] || {}
              const cellStyle = { border: '1px solid #eaecf0', padding: '3px 6px' }
              return (
                <tr key={t.id} style={{ background: t.isCritical ? '#fff5f5' : 'white' }}>
                  <td style={{ ...cellStyle, fontWeight: t.isMilestone ? 700 : 400 }}>
                    {t.isMilestone && '◆ '}{t.name}
                  </td>
                  <td style={cellStyle}>
                    <LookAheadCell taskId={t.id} field="trade" value={entry.trade || ''} onSaved={onLookaheadSaved} />
                    <span className="print-only">{entry.trade || '—'}</span>
                  </td>
                  <td style={cellStyle}>{fmt(parseDate(t.startDate))}</td>
                  <td style={cellStyle}>{fmt(parseDate(t.finishDate))}</td>
                  <td style={cellStyle}>
                    <LookAheadCell taskId={t.id} field="constraints" value={entry.constraints || ''} onSaved={onLookaheadSaved} />
                    <span className="print-only">{entry.constraints || '—'}</span>
                  </td>
                  {showInspections && (
                    <td style={cellStyle}>
                      <LookAheadCell taskId={t.id} field="inspections" value={entry.inspections || ''} onSaved={onLookaheadSaved} />
                      <span className="print-only">{entry.inspections || '—'}</span>
                    </td>
                  )}
                  <td style={cellStyle}>
                    <LookAheadCell taskId={t.id} field="materials" value={entry.materials || ''} onSaved={onLookaheadSaved} />
                    <span className="print-only">{entry.materials || '—'}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      <div style={{ marginTop: 16, borderTop: '1px solid #111', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#475467' }}>
        <span style={{ flex: 1 }}>{company?.footerText || 'COMPANY CONFIDENTIAL | For project coordination only. Schedule is a living document and may change due to permitting, inspections, owner decisions, material availability, weather, or field conditions.'}</span>
        <span style={{ marginLeft: 16, whiteSpace: 'nowrap' }}>Revision: {revision.revisionName}</span>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: inline !important; }
        }
        .print-only { display: none; }
      `}</style>
    </div>
  )
}

'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { format, differenceInCalendarDays, addDays, startOfWeek, startOfDay } from 'date-fns'
import { parseDate, fmt } from '@/lib/dates'

const COLOR_MAP: Record<string, string> = {
  blue: '#2458ff', red: '#d71920', green: '#138a36',
  teal: '#168c9a', purple: '#7a3cff', black: '#111',
}

const LEFT_COL_W = 420
const ROW_H = 22

const PRINT_SCALE_CONFIG: Record<string, {
  colPx: number
  stepDays: number
  headerFmt: (d: Date) => string
}> = {
  daily: { colPx: 40, stepDays: 1, headerFmt: d => fmt(d) },
  weekly: { colPx: 12, stepDays: 7, headerFmt: d => `Week of ${format(d, 'MMM d')}` },
  '2-week': { colPx: 20, stepDays: 14, headerFmt: d => format(d, 'MMM d') },
  biweekly: { colPx: 20, stepDays: 14, headerFmt: d => format(d, 'MMM d') },
  monthly: { colPx: 30, stepDays: 30, headerFmt: d => format(d, 'MMMM yyyy') },
  quarterly: { colPx: 24, stepDays: 90, headerFmt: d => `Q${Math.floor(d.getMonth() / 3) + 1} ${format(d, 'yyyy')}` },
  yearly: { colPx: 18, stepDays: 365, headerFmt: d => format(d, 'yyyy') },
}

type LookAheadEntry = {
  trade?: string | null
  constraints?: string | null
  inspections?: string | null
  materials?: string | null
}

type TaskRow = {
  id: string
  sortOrder: number
  level: number
  name: string
  durationDays: number
  startDate: string
  finishDate: string
  color: string
  parentTaskId: string | null
  predecessorTaskId: string | null
  relationshipType: string
  isMilestone: boolean
  isCritical: boolean
}

function sortTasks(tasks: TaskRow[]): TaskRow[] {
  return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

function buildRenderOrder(tasks: TaskRow[]): TaskRow[] {
  const byParent = new Map<string | null, TaskRow[]>()
  for (const t of tasks) {
    const key = t.parentTaskId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(t)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
  }
  const result: TaskRow[] = []
  const placed = new Set<string>()
  function appendWithChildren(task: TaskRow) {
    result.push(task)
    placed.add(task.id)
    for (const child of byParent.get(task.id) ?? []) appendWithChildren(child)
  }
  for (const root of byParent.get(null) ?? []) appendWithChildren(root)
  for (const t of sortTasks(tasks)) {
    if (!placed.has(t.id)) result.push(t)
  }
  return result
}

function hasChildren(tasks: TaskRow[], taskId: string) {
  return tasks.some(t => t.parentTaskId === taskId)
}

function getBarDates(task: TaskRow, tasks: TaskRow[]) {
  if (hasChildren(tasks, task.id)) {
    const children = tasks.filter(t => t.parentTaskId === task.id)
    return {
      start: new Date(Math.min(...children.map(c => parseDate(c.startDate).getTime()))),
      finish: new Date(Math.max(...children.map(c => parseDate(c.finishDate).getTime()))),
    }
  }
  return { start: parseDate(task.startDate), finish: parseDate(task.finishDate) }
}

function dayOffset(date: Date | string, ganttStart: Date) {
  return differenceInCalendarDays(parseDate(date), ganttStart)
}

function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = x1 + Math.sign(x2 - x1) * Math.max(12, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
}

function LookAheadCell({
  taskId, field, value, placeholder = '—', onSaved,
}: {
  taskId: string
  field: keyof LookAheadEntry
  value: string
  placeholder?: string
  onSaved: (taskId: string, field: keyof LookAheadEntry, val: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => { setDraft(value) }, [value])

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
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        className="w-full text-xs border border-orange-300 rounded px-1 py-0.5 no-print" style={{ fontSize: 9 }} />
    )
  }
  return (
    <span onClick={() => setEditing(true)} className="no-print cursor-text block min-h-[14px]" title="Click to edit">
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

  const scaleKey = searchParams.get('scale') ?? 'weekly'
  const scaleConfig = PRINT_SCALE_CONFIG[scaleKey] ?? PRINT_SCALE_CONFIG.weekly
  const COL_PX = scaleConfig.colPx

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
        const current = data.data?.revisions?.find((r: any) => r.isCurrent) ?? data.data?.revisions?.[0]
        if (current?.id) {
          const qs = searchParams.toString()
          router.replace(`/projects/${projectId}/schedule/${current.id}/print${qs ? `?${qs}` : ''}`)
          return
        }
        setNotFound(true)
        setLoading(false)
        return
      }
      await loadData(revisionId)
    }
    resolveAndLoad()
  }, [revisionId, projectId, router, loadData, searchParams])

  function onLookaheadSaved(taskId: string, field: keyof LookAheadEntry, val: string) {
    setLookahead(prev => ({ ...prev, [taskId]: { ...prev[taskId], [field]: val || null } }))
  }

  function handleSavePdf() {
    if (revision?.project?.name) {
      document.title = `${revision.project.name} - ${revision.revisionName} - Schedule`
    }
    window.print()
  }

  const chartData = useMemo(() => {
    if (!revision) return null
    const tasks = buildRenderOrder(revision.tasks || []) as TaskRow[]
    const parentIds = new Set(tasks.filter(t => t.parentTaskId).map(t => t.parentTaskId!))
    const today = startOfDay(new Date())
    const minDate = tasks.length
      ? new Date(Math.min(...tasks.map(t => parseDate(t.startDate).getTime())))
      : today
    const maxDate = tasks.length
      ? new Date(Math.max(...tasks.map(t => parseDate(t.finishDate).getTime())))
      : addDays(today, 90)
    const ganttStart = startOfWeek(addDays(minDate, -7))
    const ganttEnd = addDays(maxDate, 14)
    const totalDays = differenceInCalendarDays(ganttEnd, ganttStart)
    const chartW = totalDays * COL_PX

    const ticks: Date[] = []
    let tickCur = startOfWeek(ganttStart)
    while (tickCur <= ganttEnd) {
      ticks.push(new Date(tickCur))
      tickCur = addDays(tickCur, scaleConfig.stepDays)
    }

    const rowIndexById = new Map(tasks.map((t, i) => [t.id, i]))

    return { tasks, parentIds, today, ganttStart, ganttEnd, totalDays, chartW, ticks, rowIndexById }
  }, [revision, COL_PX, scaleConfig.stepDays])

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (notFound || !revision || !chartData) return <div className="p-8 text-red-500">Revision not found</div>

  const { tasks, parentIds, today, ganttStart, chartW, ticks, rowIndexById } = chartData
  const project = revision.project
  const company = project?.company
  const twoWeekCutoff = startOfDay(addDays(today, 14))
  const showInspections = !['no-permit', 'emergency'].includes(project?.permitStatus ?? '')
  const showLookAhead = searchParams.get('lookahead') !== 'false'
  const showSchedule = searchParams.get('schedule') !== 'false'

  const lookaheadTasks = tasks.filter(t => {
    const s = parseDate(t.startDate)
    const f = parseDate(t.finishDate)
    return (s >= today && s <= twoWeekCutoff) || (f >= today && f <= twoWeekCutoff) || (s <= today && f >= today)
  })

  const lookaheadHeaders = [
    'Task', 'Trade / Responsible', 'Start', 'Finish', 'Constraints / Notes',
    ...(showInspections ? ['Inspections'] : []), 'Materials',
  ]

  const svgHeight = tasks.length * ROW_H

  return (
    <div className="print-root" style={{ fontFamily: 'Arial,sans-serif', fontSize: 10, color: '#111', background: 'white', padding: '0.35in' }}>
      <div className="no-print mb-4 flex gap-3 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
        <Link href={`/projects/${projectId}/schedule/${revisionId}`} className="text-sm text-gray-600 hover:underline">← Back to Gantt</Link>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.print()} className="px-4 py-2 rounded-lg text-white text-sm font-bold" style={{ background: '#111' }}>
            🖨 Print PDF
          </button>
          <button onClick={handleSavePdf} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50">
            ⬇ Save as PDF
          </button>
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

      {showSchedule && (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, fontSize: 9 }}>
            {Object.entries({ blue: 'Construction', red: 'Inspection/Hold/City', green: 'Owner/Client', teal: 'Contingency', purple: 'Procurement', black: 'Phase Summary' }).map(([c, l]) => (
              <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_MAP[c], display: 'inline-block' }} />
                {l}
              </span>
            ))}
          </div>

          <div style={{ border: '1px solid #111', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ display: 'flex', background: '#f2f4f7', borderBottom: '1px solid #ccc', height: 28 }}>
              <div style={{ width: LEFT_COL_W, flexShrink: 0, borderRight: '1px solid #ccc', display: 'flex', alignItems: 'center', paddingLeft: 6, fontSize: 9, fontWeight: 700, color: '#475467', textTransform: 'uppercase' }}>
                <span style={{ width: 20 }}>#</span>
                <span style={{ flex: 1 }}>Task Name</span>
                <span style={{ width: 36, textAlign: 'center' }}>Days</span>
                <span style={{ width: 56 }}>Start</span>
                <span style={{ width: 56 }}>Finish</span>
              </div>
              <div style={{ flex: 1, position: 'relative', height: 28, overflow: 'hidden' }}>
                {ticks.map((tick, i) => (
                  <div key={i} style={{ position: 'absolute', left: dayOffset(tick, ganttStart) * COL_PX + 2, top: 8, fontSize: 8, color: '#667085', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {scaleConfig.headerFmt(tick)}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex' }}>
              <div style={{ width: LEFT_COL_W, flexShrink: 0 }}>
                {tasks.map((task, i) => {
                  const isParent = parentIds.has(task.id)
                  const isPhase = !task.parentTaskId && isParent
                  const isChild = Boolean(task.parentTaskId)
                  const rowClass = isPhase ? 'print-row-phase' : isParent ? 'print-row-parent' : isChild ? 'print-row-child' : ''
                  const indent = isChild ? 16 : 0
                  const barColor = COLOR_MAP[task.color] || '#2458ff'
                  return (
                    <div key={task.id} className={rowClass} style={{
                      display: 'flex', alignItems: 'center', height: ROW_H,
                      borderBottom: '1px solid #eaecf0', paddingLeft: 6 + indent, fontSize: 9,
                    }}>
                      <span style={{ width: 20, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.isMilestone && <span style={{ color: barColor, marginRight: 2 }}>◆</span>}{task.name}
                      </span>
                      <span style={{ width: 36, textAlign: 'center', flexShrink: 0 }}>{task.durationDays}d</span>
                      <span style={{ width: 56, flexShrink: 0 }}>{fmt(parseDate(task.startDate))}</span>
                      <span style={{ width: 56, flexShrink: 0 }}>{fmt(parseDate(task.finishDate))}</span>
                    </div>
                  )
                })}
              </div>

              <div style={{ flex: 1, overflow: 'hidden' }}>
                <svg width={chartW} height={svgHeight} className="gantt-chart-svg" style={{ display: 'block' }}>
                  <defs>
                    <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                      <path d="M 0 0 L 6 3 L 0 6 Z" fill="#94a3b8" />
                    </marker>
                  </defs>

                  {ticks.map((tick, wi) => (
                    <line key={`grid-${wi}`} x1={dayOffset(tick, ganttStart) * COL_PX} y1={0}
                      x2={dayOffset(tick, ganttStart) * COL_PX} y2={svgHeight} stroke="#f0f0f0" strokeWidth={1} />
                  ))}

                  <line x1={dayOffset(today, ganttStart) * COL_PX} y1={0}
                    x2={dayOffset(today, ganttStart) * COL_PX} y2={svgHeight} stroke="#f15a24" strokeWidth={2} opacity={0.6} />

                  {tasks.flatMap((task, rowIndex) => {
                    if (!task.predecessorTaskId || task.relationshipType === 'Manual') return []
                    const predIdx = rowIndexById.get(task.predecessorTaskId)
                    if (predIdx === undefined) return []
                    const pred = tasks[predIdx]
                    const predDates = getBarDates(pred, tasks)
                    const taskDates = getBarDates(task, tasks)
                    const predIsMil = pred.isMilestone
                    const taskIsMil = task.isMilestone
                    const predW = predIsMil ? 8 : Math.max((Math.max(1, differenceInCalendarDays(predDates.finish, predDates.start) + 1)) * COL_PX - 2, 4)
                    const taskW = taskIsMil ? 8 : Math.max((Math.max(1, differenceInCalendarDays(taskDates.finish, taskDates.start) + 1)) * COL_PX - 2, 4)
                    const predLeft = dayOffset(predDates.start, ganttStart) * COL_PX + 1
                    const taskLeft = dayOffset(taskDates.start, ganttStart) * COL_PX + 1
                    const rel = task.relationshipType || 'FS'
                    let x1: number, x2: number
                    if (rel === 'SS') { x1 = predLeft; x2 = taskLeft }
                    else if (rel === 'FF') { x1 = predLeft + predW; x2 = taskLeft + taskW }
                    else if (rel === 'SF') { x1 = predLeft; x2 = taskLeft + taskW }
                    else { x1 = predLeft + predW; x2 = taskLeft }
                    const y1 = predIdx * ROW_H + ROW_H / 2
                    const y2 = rowIndex * ROW_H + ROW_H / 2
                    return [(
                      <path key={`dep-${task.id}`} d={elbowPath(x1, y1, x2, y2)}
                        stroke="#94a3b8" strokeWidth={1.5} fill="none" markerEnd="url(#arrowhead)" />
                    )]
                  })}

                  {tasks.map((task, rowIndex) => {
                    const isParent = parentIds.has(task.id)
                    const isPhase = !task.parentTaskId && isParent
                    const barDates = getBarDates(task, tasks)
                    const left = dayOffset(barDates.start, ganttStart) * COL_PX + 1
                    const dur = Math.max(1, differenceInCalendarDays(barDates.finish, barDates.start) + 1)
                    const width = task.isMilestone ? 8 : Math.max(dur * COL_PX - 2, 4)
                    const fill = isPhase ? '#111' : isParent ? '#2458ff' : (COLOR_MAP[task.color] || '#2458ff')
                    const barH = isPhase ? 12 : isParent ? 10 : 8
                    const y = rowIndex * ROW_H + (ROW_H - barH) / 2

                    if (task.isMilestone) {
                      const cx = left + 5
                      const cy = rowIndex * ROW_H + ROW_H / 2
                      return (
                        <polygon key={`bar-${task.id}`}
                          points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`}
                          fill={fill} />
                      )
                    }

                    return (
                      <g key={`bar-${task.id}`}>
                        <rect x={left} y={y} width={width} height={barH} fill={fill} rx={3} className="gantt-bar" />
                        {width >= 60 && (
                          <text x={left + 4} y={y + barH - 3} fontSize={8} fill="white">{task.name}</text>
                        )}
                      </g>
                    )
                  })}
                </svg>
              </div>
            </div>
          </div>
        </>
      )}

      {showLookAhead && (
        <div style={{ marginTop: showSchedule ? 24 : 0, pageBreakBefore: showSchedule ? 'always' : 'auto' }}>
          <div style={{ fontWeight: 900, fontSize: 13, borderBottom: '2px solid #111', paddingBottom: 4, marginBottom: 10 }}>
            2-Week Look-Ahead — {format(today, 'MMM d')} to {format(twoWeekCutoff, 'MMM d, yyyy')}
          </div>
          <p className="no-print text-xs text-gray-500 mb-2">Click any cell to add notes. Values are saved per task.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
            <thead>
              <tr style={{ background: '#f2f4f7' }}>
                {lookaheadHeaders.map(h => (
                  <th key={h} style={{ border: '1px solid #d0d5dd', padding: '4px 6px', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', fontSize: 8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lookaheadTasks.length === 0 ? (
                <tr><td colSpan={lookaheadHeaders.length} style={{ padding: '12px 6px', textAlign: 'center', color: '#667085' }}>No tasks in the next 2 weeks</td></tr>
              ) : lookaheadTasks.map(t => {
                const entry = lookahead[t.id] || {}
                const cellStyle = { border: '1px solid #eaecf0', padding: '3px 6px' }
                return (
                  <tr key={t.id} style={{ background: t.isCritical ? '#fff5f5' : 'white' }}>
                    <td style={{ ...cellStyle, fontWeight: t.isMilestone ? 700 : 400 }}>{t.isMilestone && '◆ '}{t.name}</td>
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
        <span style={{ flex: 1 }}>{company?.footerText || 'COMPANY CONFIDENTIAL | For project coordination only.'}</span>
        <span style={{ marginLeft: 16, whiteSpace: 'nowrap' }}>Revision: {revision.revisionName}</span>
      </div>

      <style jsx global>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .print-only { display: inline !important; }
          .gantt-row-empty { display: none !important; }
          svg { overflow: visible !important; }
        }
        .print-only { display: none; }
        .print-row-phase {
          background-color: #1a1a1a !important;
          color: white !important;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .print-row-parent {
          background-color: #e8edf5 !important;
          color: #1a2b4a !important;
          font-weight: 600;
        }
        .print-row-child {
          background-color: white !important;
          color: #374151 !important;
        }
      `}</style>
    </div>
  )
}

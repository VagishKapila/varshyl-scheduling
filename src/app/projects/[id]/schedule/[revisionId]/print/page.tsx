'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { format, addDays, startOfWeek, startOfDay } from 'date-fns'
import { parseDate, fmt } from '@/lib/dates'

const COLOR_MAP: Record<string, string> = {
  blue: '#2458ff', red: '#d71920', green: '#138a36',
  teal: '#168c9a', purple: '#7a3cff', black: '#111111',
}

const COL_WIDTH = 80 // px per week column
const ROW_H = 36
const LEFT_COLS_W = 376 // 24 + 220 + 28 + 52 + 52
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

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

function getDisplayDuration(task: TaskRow, tasks: TaskRow[], saturdayWork = false): number {
  const children = tasks.filter(t => t.parentTaskId === task.id)
  if (children.length === 0) return task.durationDays

  const { start: minStart, finish: maxFinish } = getBarDates(task, tasks)
  let days = 0
  const current = new Date(minStart)
  while (current <= maxFinish) {
    const dow = current.getDay()
    if (dow === 0) { current.setDate(current.getDate() + 1); continue }
    if (dow === 6 && !saturdayWork) { current.setDate(current.getDate() + 1); continue }
    days++
    current.setDate(current.getDate() + 1)
  }
  return Math.max(1, days)
}

function getTaskColumns(
  start: Date,
  finish: Date,
  chartStart: Date,
  totalWeeks: number,
): { startCol: number; endCol: number } {
  const startCol = Math.floor((start.getTime() - chartStart.getTime()) / MS_PER_WEEK)
  const endCol = Math.ceil((finish.getTime() - chartStart.getTime()) / MS_PER_WEEK) + 1
  return {
    startCol: Math.max(0, startCol),
    endCol: Math.min(totalWeeks, Math.max(endCol, startCol + 1)),
  }
}

function buildWeekColumns(tasks: TaskRow[]) {
  const today = startOfDay(new Date())
  if (tasks.length === 0) {
    const chartStart = startOfWeek(today, { weekStartsOn: 1 })
    const weeks = [chartStart, addDays(chartStart, 7)]
    return { weeks, chartStart }
  }

  const allStarts: Date[] = []
  const allFinishes: Date[] = []
  for (const t of tasks) {
    const { start, finish } = getBarDates(t, tasks)
    allStarts.push(start, parseDate(t.startDate))
    allFinishes.push(finish, parseDate(t.finishDate))
  }

  const minDate = new Date(Math.min(...allStarts.map(d => d.getTime())))
  const maxDate = new Date(Math.max(...allFinishes.map(d => d.getTime())))

  const chartStart = startOfWeek(addDays(minDate, -7), { weekStartsOn: 1 })
  const chartEnd = addDays(maxDate, 21)

  const weeks: Date[] = []
  let current = new Date(chartStart)
  while (current <= chartEnd) {
    weeks.push(new Date(current))
    current = addDays(current, 7)
  }
  weeks.push(new Date(current))

  return { weeks, chartStart }
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

  const scheduleData = useMemo(() => {
    if (!revision) return null
    const tasks = buildRenderOrder(revision.tasks || []) as TaskRow[]
    const parentIds = new Set(tasks.filter(t => t.parentTaskId).map(t => t.parentTaskId!))
    const { weeks, chartStart } = buildWeekColumns(tasks)
    const totalWeeks = weeks.length
    return { tasks, parentIds, weeks, chartStart, totalWeeks, today: startOfDay(new Date()) }
  }, [revision])

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (notFound || !revision || !scheduleData) return <div className="p-8 text-red-500">Revision not found</div>

  const { tasks, parentIds, weeks, chartStart, totalWeeks, today } = scheduleData
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

  return (
    <div className="print-page" style={{ fontFamily: 'Arial, sans-serif', fontSize: 9, color: '#111', background: 'white' }}>
      <div className="print-toolbar no-print mb-4 flex gap-3 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
        <Link href={`/projects/${projectId}/schedule/${revisionId}`} className="text-sm text-gray-600 hover:underline">← Back to Gantt</Link>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.print()} className="px-4 py-2 rounded-lg text-white text-sm font-bold" style={{ background: '#111' }}>
            Print PDF
          </button>
          <button onClick={handleSavePdf} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50">
            Save as PDF
          </button>
        </div>
      </div>

      {/* Header — stays with schedule on page 1 */}
      <div className="print-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: 8, marginBottom: 10, pageBreakAfter: 'avoid' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {company?.logoUrl && <img src={company.logoUrl} alt="Logo" style={{ height: 44, objectFit: 'contain' }} />}
          <div>
            <div style={{ fontWeight: 900, fontSize: 13 }}>{company?.name}</div>
            <div style={{ fontWeight: 700, fontSize: 11 }}>{project?.name}</div>
            <div style={{ fontSize: 9, color: '#444' }}>{project?.clientName} — {project?.address}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 9, color: '#444' }}>
          <div style={{ fontWeight: 700 }}>Schedule Revision: {revision.revisionName}</div>
          <div>Date Issued: {format(today, 'MMM d, yyyy')}</div>
          <div>Start: {format(parseDate(project.startDate), 'MMM d, yyyy')}</div>
          <div>Target End: {format(parseDate(project.targetEndDate), 'MMM d, yyyy')}</div>
        </div>
      </div>

      {showSchedule && (
        <>
          <div className="print-legend" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8, fontSize: 8, pageBreakAfter: 'avoid' }}>
            {Object.entries({ blue: 'Construction', red: 'Inspection/Hold/City', green: 'Owner/Client', teal: 'Contingency', purple: 'Procurement', black: 'Phase Summary' }).map(([c, l]) => (
              <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_MAP[c], display: 'inline-block' }} />
                {l}
              </span>
            ))}
          </div>

          <div className="print-schedule-table" style={{ overflowX: 'auto' }}>
            <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed', width: `${LEFT_COLS_W + totalWeeks * COL_WIDTH}px` }}>
              <colgroup>
                <col style={{ width: '24px' }} />
                <col style={{ width: '220px' }} />
                <col style={{ width: '28px' }} />
                <col style={{ width: '52px' }} />
                <col style={{ width: '52px' }} />
                {weeks.map((_, i) => (
                  <col key={i} style={{ width: `${COL_WIDTH}px` }} />
                ))}
              </colgroup>

              <thead>
                <tr className="border-b-2 border-gray-400" style={{ background: '#f2f4f7' }}>
                  <th className="text-left p-1 text-gray-500 font-bold">#</th>
                  <th className="text-left p-1 font-bold text-gray-600">TASK NAME</th>
                  <th className="text-center p-1 font-bold text-gray-600">DAYS</th>
                  <th className="text-center p-1 font-bold text-gray-600">START</th>
                  <th className="text-center p-1 font-bold text-gray-600">FINISH</th>
                  {weeks.map((week, i) => (
                    <th key={i} className="text-center p-1 border-l border-gray-200 font-normal text-gray-600" style={{ fontSize: 8 }}>
                      {`${week.getMonth() + 1}/${week.getDate()}`}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {tasks.map((task, taskIndex) => {
                  const isParent = parentIds.has(task.id)
                  const isPhase = !task.parentTaskId && isParent
                  const isChild = Boolean(task.parentTaskId)
                  const barDates = getBarDates(task, tasks)
                  const { startCol, endCol } = getTaskColumns(barDates.start, barDates.finish, chartStart, totalWeeks)
                  const barColor = COLOR_MAP[task.color] ?? '#2458ff'
                  const displayDays = getDisplayDuration(task, tasks, Boolean(project?.saturdayWork))
                  const rowNumber = taskIndex + 1

                  return (
                    <tr key={task.id} style={{ pageBreakInside: 'avoid' }}>
                      <td style={{
                        background: isPhase ? '#111' : 'transparent',
                        color: isPhase ? '#fff' : '#94a3b8',
                        padding: '6px 4px',
                        fontSize: '10px',
                        textAlign: 'center',
                        borderBottom: '1px solid #f1f5f9',
                      }}>{rowNumber}</td>

                      <td style={{
                        background: isPhase ? '#111' : isParent ? '#eef2f8' : 'transparent',
                        color: isPhase ? '#fff' : '#111827',
                        padding: '6px 8px',
                        paddingLeft: isChild ? '20px' : '8px',
                        fontSize: '11px',
                        fontWeight: isPhase ? 700 : isParent ? 600 : 400,
                        borderBottom: '1px solid #f1f5f9',
                      }}>
                        {task.isMilestone && <span style={{ color: barColor, marginRight: 2 }}>◆</span>}
                        {task.name}
                      </td>

                      <td style={{
                        background: isPhase ? '#111' : 'transparent',
                        color: isPhase ? '#fff' : '#64748b',
                        padding: '6px 4px',
                        fontSize: '10px',
                        textAlign: 'center',
                        borderBottom: '1px solid #f1f5f9',
                      }}>{displayDays}d</td>

                      <td style={{
                        background: isPhase ? '#111' : 'transparent',
                        color: isPhase ? '#fff' : '#64748b',
                        padding: '6px 4px',
                        fontSize: '10px',
                        textAlign: 'center',
                        borderBottom: '1px solid #f1f5f9',
                      }}>{fmt(barDates.start)}</td>

                      <td style={{
                        background: isPhase ? '#111' : 'transparent',
                        color: isPhase ? '#fff' : '#64748b',
                        padding: '6px 4px',
                        fontSize: '10px',
                        textAlign: 'center',
                        borderBottom: '1px solid #f1f5f9',
                      }}>{fmt(barDates.finish)}</td>

                      {weeks.map((_, colIndex) => {
                        const inBar = colIndex >= startCol && colIndex < endCol
                        const isBarStart = colIndex === startCol
                        const isBarEnd = colIndex === endCol - 1

                        return (
                          <td key={colIndex} style={{
                            background: '#fff',
                            padding: 0,
                            borderBottom: '1px solid #f1f5f9',
                            borderLeft: inBar ? 'none' : '0.5px solid #e2e8f0',
                            position: 'relative',
                            height: ROW_H,
                          }}>
                            {inBar && task.isMilestone && isBarStart ? (
                              <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                width: 10,
                                height: 10,
                                backgroundColor: barColor,
                                transform: 'translate(-50%, -50%) rotate(45deg)',
                                WebkitPrintColorAdjust: 'exact',
                                printColorAdjust: 'exact',
                              } as React.CSSProperties} />
                            ) : inBar && (
                              <div
                                className="print-gantt-bar"
                                style={{
                                  position: 'absolute',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  left: isBarStart ? 4 : 0,
                                  right: isBarEnd ? 4 : 0,
                                  height: isPhase ? 14 : 10,
                                  backgroundColor: isPhase ? '#111' : barColor,
                                  borderRadius: isBarStart && isBarEnd ? 3
                                    : isBarStart ? '3px 0 0 3px'
                                    : isBarEnd ? '0 3px 3px 0'
                                    : 0,
                                  WebkitPrintColorAdjust: 'exact',
                                  printColorAdjust: 'exact',
                                } as React.CSSProperties}
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showLookAhead && (
        <div style={{ marginTop: showSchedule ? 20 : 0, pageBreakBefore: showSchedule ? 'always' : 'auto' }}>
          <div style={{ fontWeight: 900, fontSize: 12, borderBottom: '2px solid #111', paddingBottom: 4, marginBottom: 8 }}>
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

      <div style={{ marginTop: 12, borderTop: '1px solid #111', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#475467' }}>
        <span style={{ flex: 1 }}>{company?.footerText || 'COMPANY CONFIDENTIAL | For project coordination only.'}</span>
        <span style={{ marginLeft: 16, whiteSpace: 'nowrap' }}>Revision: {revision.revisionName}</span>
      </div>
    </div>
  )
}

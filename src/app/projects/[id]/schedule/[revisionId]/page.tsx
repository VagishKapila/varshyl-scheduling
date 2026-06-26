'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, addDays, differenceInCalendarDays, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from 'date-fns'
import { finishFromStart } from '@/lib/scheduling'

const COLOR_MAP: Record<string, string> = {
  blue: '#2458ff', red: '#d71920', green: '#138a36',
  teal: '#168c9a', purple: '#7a3cff', black: '#111111',
}

const SCALE_CONFIG: Record<string, {
  colPx: number
  stepDays: number
  alignStart: (d: Date) => Date
  formatLabel: (d: Date) => string
}> = {
  daily: { colPx: 28, stepDays: 1, alignStart: d => d, formatLabel: d => format(d, 'EEE MMM d') },
  weekly: { colPx: 10, stepDays: 7, alignStart: startOfWeek, formatLabel: d => `Week of ${format(d, 'MMM d')}` },
  '2-week': { colPx: 6, stepDays: 14, alignStart: d => d, formatLabel: d => format(d, 'MMM d') },
  monthly: { colPx: 3, stepDays: 30, alignStart: startOfMonth, formatLabel: d => format(d, 'MMMM yyyy') },
  quarterly: { colPx: 2, stepDays: 90, alignStart: startOfQuarter, formatLabel: d => `Q${Math.floor(d.getMonth() / 3) + 1} ${format(d, 'yyyy')}` },
  yearly: { colPx: 1, stepDays: 365, alignStart: startOfYear, formatLabel: d => format(d, 'yyyy') },
}

const NAME_COL_STORAGE = 'gantt-name-col-width'
const NAME_COL_MIN = 180
const NAME_COL_MAX = 400
const NAME_COL_DEFAULT = 220
const DRAG_COL = 20
const ROW_H = 32
const LEFT_FIXED_COLS = DRAG_COL + 28 + 48 + 76 + 76 + 72 // grip, #, days, start, finish, party

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

function computeDisplayNumbers(tasks: Task[]): Map<string, string> {
  const sorted = sortTasks(tasks)
  const map = new Map<string, string>()
  let rootNum = 0
  const childCounts = new Map<string, number>()
  for (const t of sorted) {
    if (!t.parentTaskId) {
      rootNum++
      map.set(t.id, String(rootNum))
    } else {
      const parentNum = map.get(t.parentTaskId)
      if (parentNum) {
        const cnt = (childCounts.get(t.parentTaskId) || 0) + 1
        childCounts.set(t.parentTaskId, cnt)
        map.set(t.id, `${parentNum}.${cnt}`)
      } else {
        rootNum++
        map.set(t.id, String(rootNum))
      }
    }
  }
  return map
}

function hasChildren(tasks: Task[], taskId: string): boolean {
  return tasks.some(t => t.parentTaskId === taskId)
}

function getBarDates(task: Task, tasks: Task[]): { start: Date; finish: Date } {
  if (hasChildren(tasks, task.id)) {
    const children = tasks.filter(t => t.parentTaskId === task.id)
    return {
      start: new Date(Math.min(...children.map(c => new Date(c.startDate).getTime()))),
      finish: new Date(Math.max(...children.map(c => new Date(c.finishDate).getTime()))),
    }
  }
  return { start: new Date(task.startDate), finish: new Date(task.finishDate) }
}

function dayOffsetFrom(date: Date | string, ganttStart: Date) {
  return differenceInCalendarDays(new Date(date), ganttStart)
}

function getTaskBarGeometry(
  task: Task, rowIndex: number, tasks: Task[], colPx: number, ganttStart: Date,
) {
  const barDates = getBarDates(task, tasks)
  const startOff = dayOffsetFrom(barDates.start, ganttStart) * colPx
  const dur = Math.max(1, differenceInCalendarDays(barDates.finish, barDates.start) + 1)
  const barW = task.isMilestone || task.relationshipType === 'Milestone' ? 10 : dur * colPx - 4
  const y = rowIndex * ROW_H + ROW_H / 2
  const left = startOff + 2
  const right = startOff + 2 + Math.max(barW, 4)
  const isMil = task.isMilestone || task.relationshipType === 'Milestone'
  return { y, left, right, isMilestone: isMil }
}

function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = x1 + Math.sign(x2 - x1) * Math.max(12, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
}

function getDragBlock(tasks: Task[], taskId: string): string[] {
  const children = sortTasks(tasks).filter(t => t.parentTaskId === taskId)
  if (children.length) return [taskId, ...children.map(c => c.id)]
  return [taskId]
}

function reorderTaskList(tasks: Task[], blockIds: string[], targetId: string): string[] {
  const sorted = sortTasks(tasks)
  const blockSet = new Set(blockIds)
  const blockTasks = sorted.filter(t => blockSet.has(t.id))
  const remaining = sorted.filter(t => !blockSet.has(t.id))
  const targetIdx = remaining.findIndex(t => t.id === targetId)
  const insertAt = targetIdx >= 0 ? targetIdx : remaining.length
  return [...remaining.slice(0, insertAt), ...blockTasks, ...remaining.slice(insertAt)].map(t => t.id)
}

interface Task {
  id: string; sortOrder: number; level: number; name: string
  durationDays: number; startDate: string; finishDate: string
  color: string; responsibleParty: string|null; notes: string|null
  isPermitRelated: boolean; isCritical: boolean; isMilestone: boolean
  predecessorTaskId: string|null; relationshipType: string; lagDays: number
  parentTaskId: string|null
}

export default function GanttPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const revisionId = params.revisionId as string

  const [revision, setRevision] = useState<any>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState<string>('weekly')
  const [selectedTask, setSelectedTask] = useState<Task|null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showHoldModal, setShowHoldModal] = useState(false)
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nameColWidth, setNameColWidth] = useState(NAME_COL_DEFAULT)
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)
  const [dragBlockIds, setDragBlockIds] = useState<string[]>([])
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  async function loadRevision() {
    const res = await fetch(`/api/revisions/${revisionId}`)
    const d = await res.json()
    setRevision(d.data)
    setTasks(sortTasks(d.data?.tasks || []))
    setLoading(false)
  }

  useEffect(() => {
    loadRevision()
  }, [revisionId])

  useEffect(() => {
    const saved = localStorage.getItem(NAME_COL_STORAGE)
    if (saved) {
      const w = Number(saved)
      if (!Number.isNaN(w)) setNameColWidth(Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, w)))
    }
  }, [])

  function persistNameColWidth(w: number) {
    const clamped = Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, w))
    setNameColWidth(clamped)
    localStorage.setItem(NAME_COL_STORAGE, String(clamped))
  }

  function onResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    resizeRef.current = { startX: e.clientX, startW: nameColWidth }
    function onMove(ev: MouseEvent) {
      if (!resizeRef.current) return
      const delta = ev.clientX - resizeRef.current.startX
      persistNameColWidth(resizeRef.current.startW + delta)
    }
    function onUp() {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const sortedTasks = sortTasks(tasks)
  const displayNumbers = computeDisplayNumbers(sortedTasks)
  const leftPanelWidth = LEFT_FIXED_COLS + nameColWidth

  const scaleConfig = SCALE_CONFIG[scale] || SCALE_CONFIG.weekly
  const COL_PX = scaleConfig.colPx

  const today = new Date()
  const minDate = tasks.length ? new Date(Math.min(...tasks.map(t => new Date(t.startDate).getTime()))) : today
  const maxDate = tasks.length ? new Date(Math.max(...tasks.map(t => new Date(t.finishDate).getTime()))) : addDays(today, 90)
  const ganttStart = startOfWeek(addDays(minDate, -7))
  const ganttEnd = addDays(maxDate, 30)
  const totalDays = differenceInCalendarDays(ganttEnd, ganttStart)

  function dayOffset(date: Date | string) {
    return differenceInCalendarDays(new Date(date), ganttStart)
  }

  // Build date header ticks for current scale
  const ticks: Date[] = []
  let tickCur = scaleConfig.alignStart(new Date(ganttStart))
  while (tickCur <= ganttEnd) {
    ticks.push(new Date(tickCur))
    tickCur = addDays(tickCur, scaleConfig.stepDays)
  }

  async function saveTask(id: string, data: Partial<Task>) {
    const payload: Partial<Task> = { ...data }
    if (payload.relationshipType === 'Milestone') {
      payload.isMilestone = true
      payload.durationDays = 0
    } else if (payload.relationshipType && payload.relationshipType !== 'Milestone') {
      payload.isMilestone = payload.isMilestone ?? false
    }
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    await fetch(`/api/revisions/${revisionId}/recalculate`, { method: 'POST' })
    await loadRevision()
  }

  async function updateTask(id: string, data: Partial<Task>) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...data } : t))
    if (selectedTask?.id === id) setSelectedTask(t => t ? { ...t, ...data } : null)
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    setDrawerOpen(false)
    setSelectedTask(null)
    await fetch(`/api/revisions/${revisionId}/recalculate`, { method: 'POST' })
    await loadRevision()
  }

  async function copyTask(id: string) {
    await fetch(`/api/tasks/${id}/duplicate`, { method: 'POST' })
    await fetch(`/api/revisions/${revisionId}/recalculate`, { method: 'POST' })
    await loadRevision()
  }

  async function reorderTasks(blockIds: string[], targetId: string) {
    const taskIds = reorderTaskList(tasks, blockIds, targetId)
    await fetch(`/api/revisions/${revisionId}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds }),
    })
    await fetch(`/api/revisions/${revisionId}/recalculate`, { method: 'POST' })
    await loadRevision()
  }

  function handleDragStart(taskId: string) {
    setDragBlockIds(getDragBlock(sortedTasks, taskId))
  }

  function handleDrop(targetId: string) {
    if (!dragBlockIds.length || dragBlockIds.includes(targetId)) return
    reorderTasks(dragBlockIds, targetId)
    setDragBlockIds([])
    setDragOverId(null)
  }

  function openTaskDrawer(taskId: string) {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      setSelectedTask(task)
      setDrawerOpen(true)
    }
  }

  async function saveRevision(revisionName: string, notes: string) {
    setSaving(true)
    await fetch(`/api/projects/${projectId}/revisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revisionName, notes, tasks: [] }),
    })
    setSaving(false)
    setShowRevisionModal(false)
    router.push(`/projects/${projectId}`)
  }

  const rowIndexById = new Map(sortedTasks.map((t, i) => [t.id, i]))
  const ganttWidth = totalDays * COL_PX
  const ganttHeight = sortedTasks.length * ROW_H

  const dependencyLines = sortedTasks.flatMap(task => {
    if (!task.predecessorTaskId || task.relationshipType === 'Manual') return []
    const predIdx = rowIndexById.get(task.predecessorTaskId)
    const succIdx = rowIndexById.get(task.id)
    if (predIdx === undefined || succIdx === undefined) return []
    const pred = sortedTasks[predIdx]
    const predGeo = getTaskBarGeometry(pred, predIdx, sortedTasks, COL_PX, ganttStart)
    const succGeo = getTaskBarGeometry(task, succIdx, sortedTasks, COL_PX, ganttStart)
    const rel = task.relationshipType || 'FS'
    let x1: number, x2: number
    if (rel === 'SS') { x1 = predGeo.left; x2 = succGeo.left }
    else if (rel === 'FF') { x1 = predGeo.right; x2 = succGeo.right }
    else if (rel === 'SF') { x1 = predGeo.left; x2 = succGeo.right }
    else { x1 = predGeo.right; x2 = succGeo.left }
    const y1 = predGeo.y
    const y2 = succGeo.y
    const d = elbowPath(x1, y1, x2, y2)
    const pointingRight = x2 >= x1
    const ax = x2
    const ay = y2
    const arrow = pointingRight
      ? `${ax},${ay} ${ax - 5},${ay - 3} ${ax - 5},${ay + 3}`
      : `${ax},${ay} ${ax + 5},${ay - 3} ${ax + 5},${ay + 3}`
    return [(
      <g key={`dep-${task.id}`}>
        <path d={d} fill="none" stroke="#94a3b8" strokeWidth={1.5} />
        <polygon points={arrow} fill="#94a3b8" />
      </g>
    )]
  })

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading schedule…</div>

  const project = revision?.project
  const company = project?.company

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Print header */}
      <div className="print-only px-6 py-4 border-b-2 border-gray-900 flex items-start justify-between mb-2">
        {company?.logoUrl && <img src={company.logoUrl} alt="Logo" className="h-12 object-contain" />}
        <div className="flex-1 px-4">
          <div className="font-black text-lg text-gray-900">{company?.name}</div>
          <div className="font-bold text-base">{project?.name}</div>
          <div className="text-sm text-gray-600">{project?.clientName} — {project?.address}</div>
        </div>
        <div className="text-right text-sm text-gray-600">
          <div className="font-semibold">{revision?.revisionName}</div>
          <div>Issued: {format(today, 'MMM d, yyyy')}</div>
        </div>
      </div>

      {/* Toolbar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2 flex-wrap no-print sticky top-0 z-20">
        <Link href={`/projects/${projectId}`} className="text-gray-400 hover:text-gray-700 text-sm mr-2">← {project?.name}</Link>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {Object.keys(SCALE_CONFIG).map(s => (
            <button key={s} onClick={() => setScale(s)}
              className={`px-2 py-1 text-xs rounded font-semibold capitalize transition-all ${scale===s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowAddTaskModal(true)}
            className="px-3 py-1.5 text-xs font-semibold border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-50">+ Add Task</button>
          <button onClick={() => setShowHoldModal(true)}
            className="px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50">+ Add Hold</button>
          <button onClick={() => setShowRevisionModal(true)}
            className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">Save Revision</button>
          <Link href={`/projects/${projectId}/schedule/${revisionId}/print`}>
            <button className="px-3 py-1.5 text-xs font-bold text-white rounded-lg" style={{background:'#111'}}>Print PDF</button>
          </Link>
        </div>
      </header>

      {/* Legend */}
      <div className="px-4 py-2 flex gap-4 flex-wrap text-xs border-b border-gray-100 no-print bg-gray-50">
        {[
          { color:'#2458ff', label:'Construction Tasks' },
          { color:'#d71920', label:'Inspections / Holds / City' },
          { color:'#138a36', label:'Owner / Client' },
          { color:'#168c9a', label:'Contingency / Delay' },
          { color:'#7a3cff', label:'Procurement' },
          { color:'#111', label:'Phase Summary' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{background:l.color}} />
            <span className="text-gray-600">{l.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rotate-45 inline-block" style={{background:'#111'}} />
          <span className="text-gray-600">Milestone</span>
        </div>
      </div>

      {/* Gantt table */}
      <div className="flex-1 overflow-auto">
        <div style={{minWidth: leftPanelWidth + totalDays * COL_PX}}>
          {/* Header row with dates */}
          <div className="flex sticky top-0 z-10 bg-gray-50 border-b border-gray-200" style={{height:40}}>
            <div className="flex-shrink-0 border-r border-gray-200 relative" style={{width: leftPanelWidth}}>
              <div className="grid text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 h-full items-center"
                style={{gridTemplateColumns:`${DRAG_COL}px 28px ${nameColWidth}px 48px 76px 76px 72px`}}>
                <span />
                <span>#</span>
                <span className="relative pr-2">
                  Task Name
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={onResizeStart}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-orange-300/60 active:bg-orange-400/80"
                  />
                </span>
                <span>Days</span><span>Start</span><span>Finish</span><span>Party</span>
              </div>
            </div>
            {/* Date ticks */}
            <div className="relative flex-1" style={{height:40}}>
              {ticks.map((tick, i) => (
                <div key={`${scale}-${i}`} className="absolute text-xs text-gray-400 font-medium whitespace-nowrap" style={{left: dayOffset(tick) * COL_PX + 2, top: 12}}>
                  {scaleConfig.formatLabel(tick)}
                </div>
              ))}
              {/* Today line */}
              <div className="absolute top-0 bottom-0 w-0.5 z-10" style={{left: dayOffset(today) * COL_PX, background:'#f15a24'}} />
            </div>
          </div>

          {/* Task rows + dependency overlay */}
          <div className="relative">
            <svg
              className="absolute pointer-events-none no-print"
              style={{ left: leftPanelWidth, top: 0, width: ganttWidth, height: ganttHeight, zIndex: 1 }}
              aria-hidden
            >
              {dependencyLines}
            </svg>

          {sortedTasks.map((task, rowIndex) => {
            const isPhase = task.level === 0
            const isSummary = hasChildren(sortedTasks, task.id)
            const barDates = getBarDates(task, sortedTasks)
            const startOff = dayOffset(barDates.start) * COL_PX
            const dur = Math.max(1, differenceInCalendarDays(barDates.finish, barDates.start) + 1)
            const isMil = task.isMilestone || task.relationshipType === 'Milestone'
            const barW = isMil ? 10 : dur * COL_PX - 4
            const barColor = COLOR_MAP[task.color] || '#2458ff'
            const indentPx = task.parentTaskId ? 22 * Math.max(1, task.level - 1) : 0
            const displayNum = displayNumbers.get(task.id) || '—'
            const isDragging = dragBlockIds.includes(task.id)
            const isDragOver = dragOverId === task.id

            return (
              <div key={task.id}
                className={`group flex border-b border-gray-100 cursor-pointer hover:bg-blue-50/30 ${isPhase || isSummary ? 'bg-gray-50' : ''} ${task.isCritical ? 'ring-inset ring-1 ring-red-200' : ''} ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'bg-orange-50' : ''}`}
                style={{height: ROW_H}}
                onDragOver={e => { e.preventDefault(); setDragOverId(task.id) }}
                onDragLeave={() => setDragOverId(id => id === task.id ? null : id)}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); handleDrop(task.id) }}
                onClick={() => openTaskDrawer(task.id)}>
                {/* Left table */}
                <div className="flex-shrink-0 border-r border-gray-200 flex items-center px-2"
                  style={{width: leftPanelWidth}}>
                  <div className="grid items-center gap-1 w-full text-xs"
                    style={{gridTemplateColumns:`${DRAG_COL - 4}px 24px ${nameColWidth}px 44px 76px 76px 72px`}}>
                    <span
                      draggable
                      onDragStart={e => { e.stopPropagation(); handleDragStart(task.id); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setDragBlockIds([]); setDragOverId(null) }}
                      className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none text-center no-print"
                      title="Drag to reorder"
                      onClick={e => e.stopPropagation()}
                    >⠿</span>
                    <span className="text-gray-400">{displayNum}</span>
                    <span className={`flex items-center gap-1 min-w-0 font-${isPhase || isSummary ? 'bold' : 'medium'} ${isPhase || isSummary ? 'text-gray-900' : 'text-gray-800'}`}
                      style={{paddingLeft: indentPx}}>
                      {isMil && <span className="shrink-0" style={{color:barColor}}>◆</span>}
                      <span className="truncate flex-1">{task.name}</span>
                      <span className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); copyTask(task.id) }}
                          className="px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 border border-orange-200 rounded hover:bg-orange-50"
                        >Copy</button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
                          className="px-1.5 py-0.5 text-[10px] font-semibold text-red-600 border border-red-200 rounded hover:bg-red-50"
                        >Delete</button>
                      </span>
                    </span>
                    <span className="text-gray-500 text-center">{task.durationDays}d</span>
                    <span className="text-gray-500">{format(barDates.start, 'M/d/yy')}</span>
                    <span className="text-gray-500">{format(barDates.finish, 'M/d/yy')}</span>
                    <span className="text-gray-400 truncate">{task.responsibleParty || ''}</span>
                  </div>
                </div>

                {/* Gantt bar */}
                <div className="relative flex-1" style={{height: ROW_H, zIndex: 2 }}>
                  {ticks.map((tick, wi) => (
                    <div key={`grid-${scale}-${wi}`} className="absolute top-0 bottom-0 w-px bg-gray-100"
                      style={{left: dayOffset(tick) * COL_PX}} />
                  ))}
                  {/* Today line */}
                  <div className="absolute top-0 bottom-0 w-0.5" style={{left: dayOffset(today) * COL_PX, background:'#f15a24', opacity:0.4}} />

                  {isMil ? (
                    <div className="absolute" style={{
                      left: startOff + 5, top: 10,
                      width: 12, height: 12,
                      background: barColor,
                      transform: 'rotate(45deg)',
                    }} />
                  ) : isSummary ? (
                    <div className="absolute rounded flex items-center overflow-hidden"
                      style={{
                        left: startOff + 2,
                        top: 13,
                        width: Math.max(barW, 4),
                        height: 6,
                        background: barColor,
                        opacity: 0.7,
                      }}>
                      {barW >= 60 && (
                        <span className="px-1 text-[10px] font-semibold text-white truncate block w-full" style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}>{task.name}</span>
                      )}
                    </div>
                  ) : (
                    <div className="absolute rounded flex items-center overflow-hidden"
                      style={{
                        left: startOff + 2,
                        top: 9,
                        width: Math.max(barW, 4),
                        height: 14,
                        background: barColor,
                        opacity: task.isCritical ? 1 : 0.85,
                      }}>
                      {barW >= 60 && (
                        <span className="px-1 text-[10px] font-semibold text-white truncate block w-full" style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}>{task.name}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      </div>

      {/* Print footer */}
      <div className="print-only px-6 py-3 border-t border-gray-900 flex justify-between text-xs text-gray-600 mt-2">
        <span>{company?.footerText || 'COMPANY CONFIDENTIAL | For project coordination only'}</span>
        <span>Revision: {revision?.revisionName}</span>
      </div>

      {/* Task drawer */}
      <div className={`fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-2xl z-30 transition-transform duration-200 no-print ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedTask && (
          <TaskDrawer key={selectedTask.id} task={selectedTask} tasks={sortedTasks}
            displayNumber={displayNumbers.get(selectedTask.id) || ''}
            saturdayWork={Boolean(project?.saturdayWork)}
            onClose={() => setDrawerOpen(false)}
            onSave={saveTask}
            onDelete={deleteTask}
            onDuplicate={copyTask} />
        )}
      </div>
      {drawerOpen && <div className="fixed inset-0 bg-black/10 z-20 no-print" onClick={() => setDrawerOpen(false)} />}

      {/* Hold modal */}
      {showHoldModal && (
        <HoldModal revisionId={revisionId} tasks={tasks} project={project}
          onClose={() => setShowHoldModal(false)}
          onAdded={() => { setShowHoldModal(false); loadRevision() }} />
      )}

      {showAddTaskModal && (
        <AddTaskModal revisionId={revisionId} tasks={tasks}
          onClose={() => setShowAddTaskModal(false)}
          onAdded={() => { setShowAddTaskModal(false); loadRevision() }} />
      )}

      {/* Revision modal */}
      {showRevisionModal && (
        <RevisionModal revisions={revision ? [revision] : []}
          onClose={() => setShowRevisionModal(false)}
          onSave={saveRevision} saving={saving} />
      )}
    </div>
  )
}

// Task Drawer
function TaskDrawer({ task, tasks, displayNumber, saturdayWork, onClose, onSave, onDelete, onDuplicate }: {
  task: Task; tasks: Task[]; displayNumber: string; saturdayWork: boolean; onClose: () => void
  onSave: (id: string, data: Partial<Task>) => Promise<void>
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}) {
  const [form, setForm] = useState({ ...task })
  const [saving, setSaving] = useState(false)

  function patchForm(updates: Partial<Task>) {
    setForm(f => ({ ...f, ...updates }))
  }

  function updateDuration(dur: number) {
    setForm(f => {
      const durationDays = Math.max(0, dur)
      if (f.relationshipType === 'Manual') return { ...f, durationDays }
      const finish = finishFromStart(new Date(f.startDate), durationDays || 1, saturdayWork)
      return { ...f, durationDays, finishDate: format(finish, 'yyyy-MM-dd') }
    })
  }

  function updateStartDate(startStr: string) {
    setForm(f => {
      if (f.relationshipType === 'Manual') return { ...f, startDate: startStr }
      const finish = finishFromStart(new Date(startStr), f.durationDays || 1, saturdayWork)
      return { ...f, startDate: startStr, finishDate: format(finish, 'yyyy-MM-dd') }
    })
  }

  const set = (k: string, v: any) => patchForm({ [k]: v })
  const otherTasks = tasks.filter(t => t.id !== task.id)
  const parentOptions = tasks.filter(t => t.id !== task.id && !t.parentTaskId)

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
        <h2 className="font-bold text-gray-900 text-sm">Edit Task{displayNumber ? ` #${displayNumber}` : ''}</h2>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 text-sm">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Task Name</label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Duration (days)</label>
            <input type="number" min={0} value={form.durationDays}
              onChange={e => updateDuration(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Lag Days</label>
            <input type="number" value={form.lagDays} onChange={e => set('lagDays', Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Start Date</label>
            <input type="date" value={form.startDate?.slice(0,10)}
              onChange={e => updateStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Finish Date</label>
            <input type="date" value={form.finishDate?.slice(0,10)} onChange={e => set('finishDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Relationship</label>
          <select value={form.relationshipType} onChange={e => set('relationshipType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            {['FS','SS','FF','SF','Manual','Milestone'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Predecessor</label>
          <select value={form.predecessorTaskId || ''} onChange={e => set('predecessorTaskId', e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">None</option>
            {otherTasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nest under (optional)</label>
          <select value={form.parentTaskId || ''} onChange={e => set('parentTaskId', e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">None — top level</option>
            {parentOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Color</label>
          <div className="flex gap-2">
            {Object.entries({ blue:'#2458ff', red:'#d71920', green:'#138a36', teal:'#168c9a', purple:'#7a3cff', black:'#111' }).map(([k,v]) => (
              <button key={k} onClick={() => set('color', k)}
                className={`w-7 h-7 rounded-full transition-all ${form.color===k ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                style={{background:v}} />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Responsible Party</label>
          <input value={form.responsibleParty || ''} onChange={e => set('responsibleParty', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="GC, Electrical, Plumbing…" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
          <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
        </div>
        <div className="flex gap-4">
          {[
            { key: 'isPermitRelated', label: 'Permit Related' },
            { key: 'isCritical', label: 'Critical Path' },
            { key: 'isMilestone', label: 'Milestone' },
          ].map(tog => (
            <label key={tog.key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={(form as any)[tog.key]} onChange={e => set(tog.key, e.target.checked)}
                className="rounded" />
              {tog.label}
            </label>
          ))}
        </div>
      </div>
      <div className="p-4 border-t border-gray-200 flex flex-wrap gap-2">
        <button onClick={() => onDelete(task.id)}
          className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50">Delete</button>
        <button onClick={() => { onDuplicate(task.id); onClose() }}
          className="px-3 py-2 rounded-lg border border-orange-200 text-orange-600 text-sm font-semibold hover:bg-orange-50">Duplicate</button>
        <button onClick={onClose}
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold min-w-[80px]">Cancel</button>
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await onSave(task.id, form)
              onClose()
            } finally {
              setSaving(false)
            }
          }}
          className="flex-1 px-3 py-2 rounded-lg text-white text-sm font-bold min-w-[80px] disabled:opacity-60" style={{background:'#f15a24'}}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// Add Task Modal
function AddTaskModal({ revisionId, tasks, onClose, onAdded }: {
  revisionId: string
  tasks: Task[]
  onClose: () => void
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [durationDays, setDurationDays] = useState(5)
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [predecessorTaskId, setPredecessorTaskId] = useState('')
  const [relationshipType, setRelationshipType] = useState('FS')
  const [lagDays, setLagDays] = useState(0)
  const [color, setColor] = useState('blue')
  const [responsibleParty, setResponsibleParty] = useState('')
  const [parentTaskId, setParentTaskId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const parentOptions = tasks.filter(t => !t.parentTaskId)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Task name is required'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/revisions/${revisionId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          durationDays,
          startDate,
          predecessorTaskId: predecessorTaskId || null,
          parentTaskId: parentTaskId || null,
          relationshipType,
          lagDays,
          color,
          responsibleParty: responsibleParty || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('[add task]', data.error)
        setError(data.error || 'Failed to add task')
        return
      }
      await fetch(`/api/revisions/${revisionId}/recalculate`, { method: 'POST' })
      onAdded()
    } catch (err) {
      console.error('[add task]', err)
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-lg text-gray-900 mb-4">Add Task</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Task Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Install fixtures" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Duration (working days)</label>
              <input type="number" min={1} value={durationDays} onChange={e => setDurationDays(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Predecessor</label>
            <select value={predecessorTaskId} onChange={e => setPredecessorTaskId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
              <option value="">None</option>
              {tasks.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nest under (optional)</label>
            <select value={parentTaskId} onChange={e => setParentTaskId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
              <option value="">None — top level</option>
              {parentOptions.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Relationship</label>
              <select value={relationshipType} onChange={e => setRelationshipType(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
                {['FS', 'SS', 'FF'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Lag Days</label>
              <input type="number" value={lagDays} onChange={e => setLagDays(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Color</label>
            <div className="flex gap-2">
              {Object.entries(COLOR_MAP).map(([k, v]) => (
                <button key={k} type="button" onClick={() => setColor(k)}
                  className={`w-7 h-7 rounded-full transition-all ${color === k ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                  style={{ background: v }} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Responsible Party</label>
            <input value={responsibleParty} onChange={e => setResponsibleParty(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="GC, Electrical…" />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: '#f15a24' }}>
              {loading && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              {loading ? 'Adding…' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Hold Modal
function HoldModal({ revisionId, tasks, project, onClose, onAdded }: any) {
  const [holdName, setHoldName] = useState('City comments pending')
  const [durationDays, setDurationDays] = useState(5)
  const [afterTaskId, setAfterTaskId] = useState(tasks[0]?.id || '')
  const [shiftMode, setShiftMode] = useState<'all'|'branch'|'none'>('all')
  const [loading, setLoading] = useState(false)

  const HOLD_OPTIONS = ['No payment from client','Owner decision pending','City comments pending','Material delay','Weather delay','Lease approval delay','Custom']

  async function submit() {
    setLoading(true)
    await fetch(`/api/revisions/${revisionId}/add-hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdName, durationDays, insertAfterTaskId: afterTaskId, shiftMode }),
    })
    setLoading(false)
    onAdded()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="font-bold text-lg text-gray-900 mb-4">Add Hold</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Hold Type</label>
            <select value={holdName} onChange={e => setHoldName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
              {HOLD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Duration (working days)</label>
            <input type="number" min={1} value={durationDays} onChange={e => setDurationDays(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Insert After Task</label>
            <select value={afterTaskId} onChange={e => setAfterTaskId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
              {tasks.map((t: Task) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Downstream Impact</label>
            <div className="space-y-2">
              {[
                { val:'all', label:'Shift all downstream tasks', desc:'Moves all tasks after the hold (recommended)' },
                { val:'branch', label:'Shift selected branch only', desc:'Only shifts directly dependent tasks' },
                { val:'none', label:'Manual hold only', desc:'No auto-shift — adjust manually' },
              ].map(o => (
                <label key={o.val} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${shiftMode===o.val ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="radio" name="shiftMode" value={o.val} checked={shiftMode===o.val} onChange={() => setShiftMode(o.val as any)} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{o.label}</div>
                    <div className="text-xs text-gray-500">{o.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold">Cancel</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg text-white font-bold text-sm disabled:opacity-60" style={{background:'#d71920'}}>
            {loading ? 'Adding…' : 'Insert Hold'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Revision Modal
function RevisionModal({ revisions, onClose, onSave, saving }: any) {
  const [revName, setRevName] = useState(`Rev ${revisions.length + 1}A`)
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="font-bold text-lg text-gray-900 mb-4">Save New Revision</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Revision Name</label>
            <input value={revName} onChange={e => setRevName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Change Description</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none"
              placeholder="Describe what changed in this revision…" />
          </div>
          {revisions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              ⚠ Previous revisions are preserved and cannot be overwritten.
              <div className="mt-2 space-y-1">
                {revisions.slice(0,3).map((r: any) => (
                  <div key={r.id} className="flex justify-between text-amber-600">
                    <span>{r.revisionName}</span>
                    <span>{format(new Date(r.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold">Cancel</button>
          <button onClick={() => onSave(revName, notes)} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-lg text-white font-bold text-sm disabled:opacity-60" style={{background:'#111'}}>
            {saving ? 'Saving…' : 'Save as New Revision'}
          </button>
        </div>
      </div>
    </div>
  )
}

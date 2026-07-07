'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, addDays } from 'date-fns'
import { parseDate, fmt, fmtInput, calcFinish } from '@/lib/dates'
import { GanttChart, GanttLegend } from '@/components/GanttChart'
import { SCALE_CONFIG, NAME_COL_DEFAULT, NAME_COL_MAX, NAME_COL_MIN, NAME_COL_STORAGE } from '@/lib/gantt/constants'
import { getAutoColor, COLOR_HEX, type TaskColor } from '@/lib/task-color'
import { buildRenderOrder, computeDisplayNumbers, getDragBlock, reorderTaskList, sortTasks } from '@/lib/gantt/utils'
import type { GanttTask } from '@/lib/gantt/types'

function getPredecessorLabel(task: GanttTask, allTasks: GanttTask[]): string {
  if (task.parentTaskId) {
    const parent = allTasks.find(t => t.id === task.parentTaskId)
    return parent ? `${parent.name} → ${task.name}` : task.name
  }
  return task.name
}

function buildPredecessorOptions(tasks: GanttTask[], excludeId: string) {
  const pool = tasks.filter(t => t.id !== excludeId)
  const poolIds = new Set(pool.map(t => t.id))
  const ordered = buildRenderOrder(pool)
  const elements: React.ReactNode[] = []

  for (const t of ordered) {
    if (t.parentTaskId && poolIds.has(t.parentTaskId)) continue

    const children = ordered.filter(c => c.parentTaskId === t.id && poolIds.has(c.id))
    if (children.length > 0) {
      elements.push(
        <optgroup key={`pred-group-${t.id}`} label={t.name}>
          <option value={t.id} className="font-semibold">{t.name}</option>
          {children.map(c => (
            <option key={c.id} value={c.id} className="text-xs pl-4">
              {`  → ${c.name}`}
            </option>
          ))}
        </optgroup>,
      )
    } else {
      elements.push(
        <option key={t.id} value={t.id}>{getPredecessorLabel(t, tasks)}</option>,
      )
    }
  }

  return elements
}

type Task = GanttTask

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('pdfmode') === 'true') {
      document.body.classList.add('pdfmode')
    }
  }, [])

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

  const renderedTasks = buildRenderOrder(tasks)
  const displayNumbers = computeDisplayNumbers(renderedTasks)
  const today = new Date()

  async function saveTask(id: string, data: Partial<Task>) {
    const payload: Partial<Task> = { ...data }
    if (payload.relationshipType === 'Milestone') {
      payload.isMilestone = true
      payload.durationDays = 0
    } else if (payload.relationshipType && payload.relationshipType !== 'Milestone') {
      payload.isMilestone = payload.isMilestone ?? false
    }
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (json.data?.tasks) {
      setRevision((r: any) => (r ? { ...r, tasks: json.data.tasks } : r))
      setTasks(sortTasks(json.data.tasks))
      if (selectedTask?.id === id) {
        const updated = json.data.tasks.find((t: Task) => t.id === id)
        if (updated) setSelectedTask(updated)
      }
    } else {
      await loadRevision()
    }
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

  async function cleanupOrphans() {
    const res = await fetch(`/api/revisions/${revisionId}/cleanup`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Cleanup failed')
      return
    }
    if (data.data?.deleted > 0) {
      await loadRevision()
    } else {
      alert('No orphaned tasks found')
    }
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
    setDragBlockIds(getDragBlock(tasks, taskId))
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
    try {
      const res = await fetch(`/api/projects/${projectId}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisionName, notes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save revision')
      setShowRevisionModal(false)
      router.push(`/projects/${projectId}/schedule/${json.data.id}`)
    } finally {
      setSaving(false)
    }
  }

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
          <button onClick={cleanupOrphans}
            className="px-2 py-1.5 text-xs text-gray-400 border border-transparent rounded-lg hover:text-gray-600 hover:border-gray-200"
            title="Remove disconnected tasks at end of schedule">Clean up</button>
          <div className="relative group">
            <button type="button" className="px-3 py-1.5 text-xs font-bold text-white rounded-lg" style={{ background: '#111' }}>
              Print PDF ▾
            </button>
            <div className="hidden group-hover:block group-focus-within:block absolute right-0 top-full mt-1 bg-white shadow-lg rounded-lg border border-gray-200 py-1 z-50 min-w-[220px]">
              <a
                href={`/projects/${projectId}/schedule/${revisionId}/print?scale=${scale}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                Full Schedule + Look-Ahead
              </a>
              <a
                href={`/projects/${projectId}/schedule/${revisionId}/print?scale=${scale}&lookahead=false`}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                Schedule Only
              </a>
              <a
                href={`/projects/${projectId}/schedule/${revisionId}/print?scale=${scale}&schedule=false`}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                Look-Ahead Only
              </a>
            </div>
          </div>
        </div>
      </header>

      <GanttLegend />

      <GanttChart
        tasks={tasks}
        scale={scale}
        nameColWidth={nameColWidth}
        onResizeStart={onResizeStart}
        dragBlockIds={dragBlockIds}
        dragOverId={dragOverId}
        onDragStart={handleDragStart}
        onDragOver={id => setDragOverId(id)}
        onDragLeave={id => setDragOverId(cur => cur === id ? null : cur)}
        onDrop={handleDrop}
        onTaskClick={openTaskDrawer}
        onCopyTask={copyTask}
        onDeleteTask={deleteTask}
        onDragEnd={() => { setDragBlockIds([]); setDragOverId(null) }}
      />

      {/* Print footer */}
      <div className="print-only px-6 py-3 border-t border-gray-900 flex justify-between text-xs text-gray-600 mt-2">
        <span>{company?.footerText || 'COMPANY CONFIDENTIAL | For project coordination only'}</span>
        <span>Revision: {revision?.revisionName}</span>
      </div>

      {/* Task drawer */}
      <div className={`fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-2xl z-30 transition-transform duration-200 no-print ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedTask && (
          <TaskDrawer key={selectedTask.id} task={selectedTask} tasks={renderedTasks}
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
  const [meta, setMeta] = useState({
    name: task.name,
    lagDays: task.lagDays,
    relationshipType: task.relationshipType,
    predecessorTaskId: task.predecessorTaskId,
    parentTaskId: task.parentTaskId,
    color: task.color,
    responsibleParty: task.responsibleParty || '',
    notes: task.notes || '',
    isPermitRelated: task.isPermitRelated,
    isCritical: task.isCritical,
    isMilestone: task.isMilestone,
  })
  const [saving, setSaving] = useState(false)

  const [startDate, setStartDate] = useState(() => parseDate(task.startDate))
  const [duration, setDuration] = useState(() =>
    task.relationshipType === 'Milestone' || task.isMilestone
      ? task.durationDays
      : Math.max(1, task.durationDays),
  )
  const [manualFinish, setManualFinish] = useState(() => parseDate(task.finishDate))
  const [manualColor, setManualColor] = useState(() => task.color !== getAutoColor(task.name))

  const isManual = meta.relationshipType === 'Manual'
  const isMilestone = meta.relationshipType === 'Milestone' || meta.isMilestone

  const finishDate = isManual
    ? manualFinish
    : isMilestone
      ? startDate
      : calcFinish(startDate, duration, saturdayWork)

  const setMetaField = (k: string, v: unknown) => setMeta(m => ({ ...m, [k]: v }))

  const handleNameChange = (name: string) => {
    setMeta(f => ({
      ...f,
      name,
      color: manualColor ? f.color : getAutoColor(name),
    }))
  }

  const handleColorPick = (color: TaskColor) => {
    setManualColor(true)
    setMeta(f => ({ ...f, color }))
  }

  const parentOptions = tasks.filter(t => t.id !== task.id && !t.parentTaskId)

  const onDurationChange = (val: string) => {
    const d = isMilestone ? Math.max(0, parseInt(val) || 0) : Math.max(1, parseInt(val) || 1)
    setDuration(d)
  }

  const onStartChange = (val: string) => {
    setStartDate(parseDate(val))
  }

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave(task.id, {
        ...meta,
        durationDays: duration,
        startDate: fmtInput(startDate),
        finishDate: fmtInput(finishDate),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }, [saving, meta, duration, startDate, finishDate, task.id, onSave, onClose])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, handleSave])

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
        <h2 className="font-bold text-gray-900 text-sm">Edit Task{displayNumber ? ` #${displayNumber}` : ''}</h2>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 text-sm">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Task Name</label>
          <input value={meta.name} onChange={e => handleNameChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Duration (days)</label>
            <input type="number" min={isMilestone ? 0 : 1} value={duration}
              onChange={e => onDurationChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Lag Days</label>
            <input type="number" value={meta.lagDays} onChange={e => setMetaField('lagDays', Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Start Date</label>
            <input type="date" value={fmtInput(startDate)}
              onChange={e => onStartChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Finish Date{!isManual && <span className="normal-case font-normal text-gray-400"> (calculated)</span>}
            </label>
            {isManual ? (
              <input type="date" value={fmtInput(manualFinish)}
                onChange={e => setManualFinish(parseDate(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            ) : (
              <input type="text" value={fmt(finishDate)} readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Relationship</label>
          <select value={meta.relationshipType} onChange={e => setMetaField('relationshipType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            {['FS','SS','FF','SF','Manual','Milestone'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Predecessor</label>
          <select value={meta.predecessorTaskId || ''} onChange={e => setMetaField('predecessorTaskId', e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">None</option>
            {buildPredecessorOptions(tasks, task.id)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nest under (optional)</label>
          <select value={meta.parentTaskId || ''} onChange={e => setMetaField('parentTaskId', e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">None — top level</option>
            {parentOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Color</label>
          <div className="flex gap-2">
            {Object.entries(COLOR_HEX).map(([k, v]) => (
              <button key={k} type="button" onClick={() => handleColorPick(k as TaskColor)}
                className={`w-7 h-7 rounded-full transition-all ${meta.color===k ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                style={{background:v}} />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Responsible Party</label>
          <input value={meta.responsibleParty} onChange={e => setMetaField('responsibleParty', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="GC, Electrical, Plumbing…" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
          <textarea value={meta.notes} onChange={e => setMetaField('notes', e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
        </div>
        <div className="flex gap-4">
          {[
            { key: 'isPermitRelated', label: 'Permit Related' },
            { key: 'isCritical', label: 'Critical Path' },
            { key: 'isMilestone', label: 'Milestone' },
          ].map(tog => (
            <label key={tog.key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={(meta as any)[tog.key]} onChange={e => setMetaField(tog.key, e.target.checked)}
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
          onClick={handleSave}
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
  const [color, setColor] = useState<TaskColor>('blue')
  const [manualColor, setManualColor] = useState(false)
  const [responsibleParty, setResponsibleParty] = useState('')
  const [parentTaskId, setParentTaskId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const parentOptions = tasks.filter(t => !t.parentTaskId)

  const handleNameChange = (nextName: string) => {
    setName(nextName)
    if (!manualColor) setColor(getAutoColor(nextName))
  }

  const handleColorPick = (nextColor: TaskColor) => {
    setManualColor(true)
    setColor(nextColor)
  }

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
            <input value={name} onChange={e => handleNameChange(e.target.value)} required
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
              {buildPredecessorOptions(tasks, '')}
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
              {Object.entries(COLOR_HEX).map(([k, v]) => (
                <button key={k} type="button" onClick={() => handleColorPick(k as TaskColor)}
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

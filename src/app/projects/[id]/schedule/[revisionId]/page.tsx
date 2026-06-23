'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, addDays, differenceInCalendarDays, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from 'date-fns'

const COLOR_MAP: Record<string, string> = {
  blue: '#2458ff', red: '#d71920', green: '#138a36',
  teal: '#168c9a', purple: '#7a3cff', black: '#111111',
}

const SCALE_CONFIG: Record<string, {
  colPx: number
  stepDays: number
  alignStart: (d: Date) => Date
  formatLabel: (d: Date) => string
  showBarLabels: boolean
}> = {
  daily: { colPx: 28, stepDays: 1, alignStart: d => d, formatLabel: d => format(d, 'EEE MMM d'), showBarLabels: true },
  weekly: { colPx: 10, stepDays: 7, alignStart: startOfWeek, formatLabel: d => `Week of ${format(d, 'MMM d')}`, showBarLabels: true },
  '2-week': { colPx: 6, stepDays: 14, alignStart: d => d, formatLabel: d => format(d, 'MMM d'), showBarLabels: false },
  monthly: { colPx: 3, stepDays: 30, alignStart: startOfMonth, formatLabel: d => format(d, 'MMMM yyyy'), showBarLabels: false },
  quarterly: { colPx: 2, stepDays: 90, alignStart: startOfQuarter, formatLabel: d => `Q${Math.floor(d.getMonth() / 3) + 1} ${format(d, 'yyyy')}`, showBarLabels: false },
  yearly: { colPx: 1, stepDays: 365, alignStart: startOfYear, formatLabel: d => format(d, 'yyyy'), showBarLabels: false },
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

  async function loadRevision() {
    const res = await fetch(`/api/revisions/${revisionId}`)
    const d = await res.json()
    setRevision(d.data)
    setTasks((d.data?.tasks || []).sort((a: Task, b: Task) => a.sortOrder - b.sortOrder))
    setLoading(false)
  }

  useEffect(() => {
    loadRevision()
  }, [revisionId])

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
    setTasks(ts => ts.filter(t => t.id !== id))
    setDrawerOpen(false)
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
        <div style={{minWidth: 480 + totalDays * COL_PX}}>
          {/* Header row with dates */}
          <div className="flex sticky top-0 z-10 bg-gray-50 border-b border-gray-200" style={{height:40}}>
            <div className="flex-shrink-0 border-r border-gray-200" style={{width:480}}>
              <div className="grid text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 h-full items-center"
                style={{gridTemplateColumns:'28px 1fr 48px 80px 80px 80px'}}>
                <span>#</span><span>Task Name</span><span>Days</span><span>Start</span><span>Finish</span><span>Party</span>
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

          {/* Task rows */}
          {tasks.map((task, i) => {
            const isPhase = task.level === 0
            const startOff = dayOffset(task.startDate) * COL_PX
            const dur = Math.max(1, differenceInCalendarDays(new Date(task.finishDate), new Date(task.startDate)) + 1)
            const barW = task.isMilestone ? 10 : dur * COL_PX - 4
            const barColor = COLOR_MAP[task.color] || '#2458ff'
            const indent = task.level * 20

            return (
              <div key={task.id}
                className={`flex border-b border-gray-100 cursor-pointer hover:bg-blue-50/30 ${isPhase ? 'bg-gray-50' : ''} ${task.isCritical ? 'ring-inset ring-1 ring-red-200' : ''}`}
                style={{height:32}}
                onClick={() => { setSelectedTask(task); setDrawerOpen(true) }}>
                {/* Left table */}
                <div className="flex-shrink-0 border-r border-gray-200 flex items-center px-2"
                  style={{width:480, paddingLeft: indent + 8}}>
                  <div className="grid items-center gap-1 w-full text-xs"
                    style={{gridTemplateColumns:'24px 1fr 44px 76px 76px 72px'}}>
                    <span className="text-gray-400">{i+1}</span>
                    <span className={`truncate font-${isPhase ? 'bold' : 'medium'} ${isPhase ? 'text-gray-900' : 'text-gray-800'}`}
                      style={{paddingLeft: indent}}>
                      {task.isMilestone && <span className="mr-1" style={{color:barColor}}>◆</span>}
                      {task.name}
                    </span>
                    <span className="text-gray-500 text-center">{task.durationDays}d</span>
                    <span className="text-gray-500">{format(new Date(task.startDate), 'M/d/yy')}</span>
                    <span className="text-gray-500">{format(new Date(task.finishDate), 'M/d/yy')}</span>
                    <span className="text-gray-400 truncate">{task.responsibleParty || ''}</span>
                  </div>
                </div>

                {/* Gantt bar */}
                <div className="relative flex-1" style={{height:32}}>
                  {ticks.map((tick, wi) => (
                    <div key={`grid-${scale}-${wi}`} className="absolute top-0 bottom-0 w-px bg-gray-100"
                      style={{left: dayOffset(tick) * COL_PX}} />
                  ))}
                  {/* Today line */}
                  <div className="absolute top-0 bottom-0 w-0.5" style={{left: dayOffset(today) * COL_PX, background:'#f15a24', opacity:0.4}} />

                  {task.isMilestone ? (
                    <div className="absolute" style={{
                      left: startOff + 5, top: 10,
                      width: 12, height: 12,
                      background: barColor,
                      transform: 'rotate(45deg)',
                    }} />
                  ) : (
                    <div className={`absolute rounded ${isPhase ? '' : 'rounded'} flex items-center overflow-hidden`}
                      style={{
                        left: startOff + 2,
                        top: isPhase ? 13 : 9,
                        width: Math.max(barW, 4),
                        height: isPhase ? 6 : 14,
                        background: barColor,
                        opacity: task.isCritical ? 1 : 0.85,
                      }}>
                      {scaleConfig.showBarLabels && barW >= 72 && !isPhase && (
                        <span className="px-1 text-[10px] font-semibold text-white truncate">{task.name}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
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
          <TaskDrawer task={selectedTask} tasks={tasks}
            onClose={() => setDrawerOpen(false)}
            onSave={updateTask}
            onDelete={deleteTask} />
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
function TaskDrawer({ task, tasks, onClose, onSave, onDelete }: {
  task: Task; tasks: Task[]; onClose: () => void
  onSave: (id: string, data: Partial<Task>) => void
  onDelete: (id: string) => void
}) {
  const [form, setForm] = useState({ ...task })
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const otherTasks = tasks.filter(t => t.id !== task.id)

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
        <h2 className="font-bold text-gray-900 text-sm">Edit Task</h2>
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
            <input type="number" min={0} value={form.durationDays} onChange={e => set('durationDays', Number(e.target.value))}
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
            <input type="date" value={form.startDate?.slice(0,10)} onChange={e => set('startDate', e.target.value)}
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
            {['FS','SS','FF','Manual','Milestone'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Predecessor</label>
          <select value={form.predecessorTaskId || ''} onChange={e => set('predecessorTaskId', e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">None</option>
            {otherTasks.map(t => <option key={t.id} value={t.id}>{t.sortOrder}. {t.name}</option>)}
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
      <div className="p-4 border-t border-gray-200 flex gap-2">
        <button onClick={() => onDelete(task.id)}
          className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50">Delete</button>
        <button onClick={onClose}
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold">Cancel</button>
        <button onClick={() => { onSave(task.id, form); onClose() }}
          className="flex-1 px-3 py-2 rounded-lg text-white text-sm font-bold" style={{background:'#f15a24'}}>Save Changes</button>
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
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
                <option key={t.id} value={t.id}>{t.sortOrder}. {t.name}</option>
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
              {tasks.map((t: Task) => <option key={t.id} value={t.id}>{t.sortOrder}. {t.name}</option>)}
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

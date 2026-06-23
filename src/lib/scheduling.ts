import { addDays, isWeekend, isSaturday, isSunday, differenceInCalendarDays } from 'date-fns'

export function addWorkingDays(start: Date, days: number, saturdayWork = false): Date {
  let current = new Date(start)
  let remaining = days
  while (remaining > 0) {
    current = addDays(current, 1)
    if (isSunday(current)) continue
    if (isSaturday(current) && !saturdayWork) continue
    remaining--
  }
  return current
}

export function workingDaysBetween(start: Date, end: Date, saturdayWork = false): number {
  let count = 0
  let current = new Date(start)
  const endDate = new Date(end)
  while (current < endDate) {
    current = addDays(current, 1)
    if (isSunday(current)) continue
    if (isSaturday(current) && !saturdayWork) continue
    count++
  }
  return count
}

export function nextWorkingDay(date: Date, saturdayWork = false): Date {
  let d = new Date(date)
  while (true) {
    if (isSunday(d)) { d = addDays(d, 1); continue }
    if (isSaturday(d) && !saturdayWork) { d = addDays(d, 1); continue }
    return d
  }
}

export function autoColor(name: string): string {
  const lower = name.toLowerCase()
  if (/inspection|city|hold|delay|resubmit|comments/.test(lower)) return 'red'
  if (/owner|client|move-in|furniture/.test(lower)) return 'green'
  if (/procurement|long lead|order|submittal/.test(lower)) return 'purple'
  return 'blue'
}

interface TaskLike {
  id: string
  sortOrder: number
  level: number
  startDate: Date
  finishDate: Date
  durationDays: number
  relationshipType: string
  predecessorTaskId: string | null
  lagDays: number
  isMilestone: boolean
  parentTaskId: string | null
}

export function recalculateDates(
  tasks: TaskLike[],
  saturdayWork = false
): TaskLike[] {
  const sorted = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder)
  const byId = new Map(sorted.map(t => [t.id, { ...t }]))

  for (const task of sorted) {
    const t = byId.get(task.id)!
    if (!task.predecessorTaskId || task.relationshipType === 'Manual') continue

    const pred = byId.get(task.predecessorTaskId)
    if (!pred) continue

    let newStart = new Date(t.startDate)

    if (task.relationshipType === 'FS') {
      newStart = addWorkingDays(pred.finishDate, task.lagDays, saturdayWork)
      newStart = nextWorkingDay(newStart, saturdayWork)
    } else if (task.relationshipType === 'SS') {
      newStart = addWorkingDays(pred.startDate, task.lagDays, saturdayWork)
      newStart = nextWorkingDay(newStart, saturdayWork)
    } else if (task.relationshipType === 'FF') {
      const newFinish = addWorkingDays(pred.finishDate, task.lagDays, saturdayWork)
      const dur = task.isMilestone ? 0 : task.durationDays
      // work backwards
      let d = new Date(newFinish)
      let rem = dur
      while (rem > 0) {
        d = addDays(d, -1)
        if (isSunday(d)) continue
        if (isSaturday(d) && !saturdayWork) continue
        rem--
      }
      t.startDate = d
      t.finishDate = newFinish
      byId.set(t.id, t)
      continue
    }

    t.startDate = newStart
    t.finishDate = task.isMilestone
      ? newStart
      : addWorkingDays(newStart, task.durationDays - 1, saturdayWork)
    byId.set(t.id, t)
  }

  // Update phase rows: min start / max finish of children
  const phases = sorted.filter(t => t.level === 0)
  for (const phase of phases) {
    const children = sorted.filter(t => t.parentTaskId === phase.id)
    if (!children.length) continue
    const p = byId.get(phase.id)!
    p.startDate = new Date(Math.min(...children.map(c => byId.get(c.id)!.startDate.getTime())))
    p.finishDate = new Date(Math.max(...children.map(c => byId.get(c.id)!.finishDate.getTime())))
    byId.set(phase.id, p)
  }

  return sorted.map(t => byId.get(t.id)!)
}

export function generateScheduleFromTemplate(
  templateTasks: any[],
  projectStart: Date,
  saturdayWork = false
): Omit<TaskLike, 'id'>[] {
  const sorted = [...templateTasks].sort((a, b) => a.sortOrder - b.sortOrder)
  const result: any[] = []
  const indexById = new Map<string, number>()

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    let startDate = new Date(projectStart)
    let predResult: any = null

    if (t.predecessorTemplateTaskId) {
      const predIdx = indexById.get(t.predecessorTemplateTaskId)
      if (predIdx !== undefined) predResult = result[predIdx]
    }

    if (predResult) {
      if (t.relationshipType === 'FS') {
        startDate = addWorkingDays(predResult.finishDate, t.lagDays || 0, saturdayWork)
      } else if (t.relationshipType === 'SS') {
        startDate = addWorkingDays(predResult.startDate, t.lagDays || 0, saturdayWork)
      } else {
        startDate = new Date(predResult.finishDate)
      }
    }

    startDate = nextWorkingDay(startDate, saturdayWork)

    const dur = t.defaultDurationDays || 1
    const finishDate = t.isMilestone ? startDate : addWorkingDays(startDate, dur - 1, saturdayWork)

    const item = {
      sortOrder: t.sortOrder,
      level: t.level || 1,
      name: t.name,
      durationDays: dur,
      startDate,
      finishDate,
      relationshipType: t.relationshipType || 'FS',
      predecessorTaskId: null as string | null, // mapped after insert
      lagDays: t.lagDays || 0,
      color: t.color || autoColor(t.name),
      responsibleParty: t.responsibleParty || null,
      notes: null,
      isPermitRelated: t.isPermitRelated || false,
      isCritical: false,
      isMilestone: t.isMilestone || false,
      parentTaskId: null as string | null,
      _templateId: t.id,
      _predTemplateId: t.predecessorTemplateTaskId || null,
    }

    indexById.set(t.id, i)
    result.push(item)
  }

  return result
}

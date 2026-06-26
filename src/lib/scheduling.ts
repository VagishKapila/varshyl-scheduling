import { addDays, isSaturday, isSunday, startOfDay } from 'date-fns'

export interface TaskLike {
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

function atMidnight(d: Date): Date {
  return startOfDay(new Date(d))
}

export function isWorkingDay(date: Date, saturdayWork = false): boolean {
  if (isSunday(date)) return false
  if (isSaturday(date) && !saturdayWork) return false
  return true
}

/** Snap to nearest working day on or after date. */
export function normalizeWorkingDay(date: Date, saturdayWork = false): Date {
  let d = atMidnight(date)
  while (!isWorkingDay(d, saturdayWork)) {
    d = addDays(d, 1)
  }
  return d
}

export function addWorkingDays(start: Date, days: number, saturdayWork = false): Date {
  if (days === 0) return normalizeWorkingDay(start, saturdayWork)
  if (days < 0) return subtractWorkingDays(start, -days, saturdayWork)

  let current = atMidnight(start)
  let remaining = days
  while (remaining > 0) {
    current = addDays(current, 1)
    if (!isWorkingDay(current, saturdayWork)) continue
    remaining--
  }
  return current
}

export function subtractWorkingDays(finish: Date, days: number, saturdayWork = false): Date {
  if (days === 0) return normalizeWorkingDay(finish, saturdayWork)
  if (days < 0) return addWorkingDays(finish, -days, saturdayWork)

  let current = atMidnight(finish)
  let remaining = days
  while (remaining > 0) {
    current = addDays(current, -1)
    if (!isWorkingDay(current, saturdayWork)) continue
    remaining--
  }
  return current
}

export function nextWorkingDay(date: Date, saturdayWork = false): Date {
  let d = atMidnight(date)
  if (isWorkingDay(d, saturdayWork)) return d
  return normalizeWorkingDay(addDays(d, 1), saturdayWork)
}

export function finishFromStart(start: Date, durationDays: number, saturdayWork = false): Date {
  const normalizedStart = normalizeWorkingDay(start, saturdayWork)
  if (durationDays <= 0) return normalizedStart
  if (durationDays === 1) return normalizedStart
  return addWorkingDays(normalizedStart, durationDays - 1, saturdayWork)
}

export function snapToProjectStart(date: Date, projectStart: Date, saturdayWork = false): Date {
  const floor = normalizeWorkingDay(projectStart, saturdayWork)
  const d = normalizeWorkingDay(date, saturdayWork)
  if (d.getTime() < floor.getTime()) return floor
  return d
}

export function autoColor(name: string): string {
  const lower = name.toLowerCase()
  if (/inspection|city|hold|delay|resubmit|comments/.test(lower)) return 'red'
  if (/owner|client|move-in|furniture/.test(lower)) return 'green'
  if (/procurement|long lead|order|submittal/.test(lower)) return 'purple'
  return 'blue'
}

/**
 * Microsoft Project–style dependency math.
 * Duration is working days; finish = start + (duration - 1) working days.
 */
export function calcTaskDates(
  task: TaskLike,
  predecessor: TaskLike | null,
  saturdayWork = false,
  projectStart?: Date,
): { startDate: Date; finishDate: Date } {
  const rel = task.relationshipType || 'FS'
  const lag = task.lagDays ?? 0
  const isMil = task.isMilestone || rel === 'Milestone'
  const dur = isMil ? 0 : Math.max(task.durationDays, 1)

  if (rel === 'Manual' || !predecessor) {
    let start = normalizeWorkingDay(new Date(task.startDate), saturdayWork)
    let finish = isMil ? start : finishFromStart(start, dur, saturdayWork)
    if (projectStart) {
      start = snapToProjectStart(start, projectStart, saturdayWork)
      finish = isMil ? start : finishFromStart(start, dur, saturdayWork)
    }
    return { startDate: start, finishDate: finish }
  }

  const predStart = normalizeWorkingDay(predecessor.startDate, saturdayWork)
  const predFinish = normalizeWorkingDay(predecessor.finishDate, saturdayWork)

  if (rel === 'Milestone' || isMil) {
    const milestoneDate = snapToProjectStart(
      addWorkingDays(predFinish, lag, saturdayWork),
      projectStart ?? predStart,
      saturdayWork,
    )
    return { startDate: milestoneDate, finishDate: milestoneDate }
  }

  let start: Date
  let finish: Date

  switch (rel) {
    case 'FS': {
      start = addWorkingDays(predFinish, lag, saturdayWork)
      finish = dur <= 1 ? start : finishFromStart(start, dur, saturdayWork)
      break
    }
    case 'SS': {
      start = addWorkingDays(predStart, lag, saturdayWork)
      finish = dur <= 1 ? start : finishFromStart(start, dur, saturdayWork)
      break
    }
    case 'FF': {
      finish = addWorkingDays(predFinish, lag, saturdayWork)
      start = dur <= 1 ? finish : subtractWorkingDays(finish, dur - 1, saturdayWork)
      break
    }
    case 'SF': {
      finish = addWorkingDays(predStart, lag, saturdayWork)
      start = dur <= 1 ? finish : subtractWorkingDays(finish, dur - 1, saturdayWork)
      break
    }
    default: {
      start = addWorkingDays(predFinish, lag, saturdayWork)
      finish = dur <= 1 ? start : finishFromStart(start, dur, saturdayWork)
    }
  }

  if (projectStart) {
    start = snapToProjectStart(start, projectStart, saturdayWork)
    finish = isMil ? start : finishFromStart(start, dur, saturdayWork)
  }

  return {
    startDate: normalizeWorkingDay(start, saturdayWork),
    finishDate: normalizeWorkingDay(finish, saturdayWork),
  }
}

/** @deprecated Use calcTaskDates */
export function calcSuccessorDates(
  predecessor: TaskLike,
  successor: TaskLike,
  saturdayWork = false,
): { startDate: Date; finishDate: Date } {
  return calcTaskDates(successor, predecessor, saturdayWork)
}

export function recalculateDates(
  tasks: TaskLike[],
  saturdayWork = false,
  projectStart?: Date,
): TaskLike[] {
  const sorted = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder)
  const floor = projectStart ? normalizeWorkingDay(projectStart, saturdayWork) : undefined
  let byId = new Map(
    sorted.map(t => {
      const start = floor
        ? snapToProjectStart(t.startDate, floor, saturdayWork)
        : normalizeWorkingDay(t.startDate, saturdayWork)
      const dur = t.isMilestone || t.relationshipType === 'Milestone' ? 0 : Math.max(t.durationDays, 1)
      const finish = t.isMilestone || t.relationshipType === 'Milestone'
        ? start
        : finishFromStart(start, dur, saturdayWork)
      return [t.id, { ...t, startDate: start, finishDate: finish }]
    }),
  )

  const maxPasses = Math.max(sorted.length * 2, 4)
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false
    for (const task of sorted) {
      const t = byId.get(task.id)!
      const pred = task.predecessorTaskId ? byId.get(task.predecessorTaskId) : null
      const { startDate, finishDate } = calcTaskDates(t, pred ?? null, saturdayWork, floor)

      if (startDate.getTime() !== t.startDate.getTime() || finishDate.getTime() !== t.finishDate.getTime()) {
        t.startDate = startDate
        t.finishDate = finishDate
        byId.set(task.id, t)
        changed = true
      }
    }
    if (!changed) break
  }

  const parents = sorted.filter(t => sorted.some(c => c.parentTaskId === t.id))
  for (const parent of parents) {
    const children = sorted.filter(t => t.parentTaskId === parent.id)
    if (!children.length) continue
    const p = byId.get(parent.id)!
    p.startDate = new Date(Math.min(...children.map(c => byId.get(c.id)!.startDate.getTime())))
    p.finishDate = new Date(Math.max(...children.map(c => byId.get(c.id)!.finishDate.getTime())))
    byId.set(parent.id, p)
  }

  return sorted.map(t => byId.get(t.id)!)
}

export function generateScheduleFromTemplate(
  templateTasks: any[],
  projectStart: Date,
  saturdayWork = false,
): Omit<TaskLike, 'id'>[] {
  const sorted = [...templateTasks].sort((a, b) => a.sortOrder - b.sortOrder)
  const result: any[] = []
  const indexById = new Map<string, number>()
  const floor = normalizeWorkingDay(projectStart, saturdayWork)

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    const dur = t.defaultDurationDays || 1
    let predResult: TaskLike | null = null

    if (t.predecessorTemplateTaskId) {
      const predIdx = indexById.get(t.predecessorTemplateTaskId)
      if (predIdx !== undefined) predResult = result[predIdx]
    }

    const stub: TaskLike = {
      id: t.id,
      sortOrder: t.sortOrder,
      level: t.level || 1,
      startDate: floor,
      finishDate: floor,
      durationDays: dur,
      relationshipType: t.relationshipType || 'FS',
      predecessorTaskId: t.predecessorTemplateTaskId || null,
      lagDays: t.lagDays || 0,
      isMilestone: t.isMilestone || false,
      parentTaskId: null,
    }

    const { startDate, finishDate } = predResult
      ? calcTaskDates(stub, predResult, saturdayWork, floor)
      : calcTaskDates(
          { ...stub, relationshipType: 'Manual' },
          null,
          saturdayWork,
          floor,
        )

    const item = {
      sortOrder: t.sortOrder,
      level: t.level || 1,
      name: t.name,
      durationDays: dur,
      startDate,
      finishDate,
      relationshipType: t.relationshipType || 'FS',
      predecessorTaskId: null as string | null,
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

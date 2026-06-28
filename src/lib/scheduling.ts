import { prisma } from '@/lib/prisma'
import { parseDate, addWorkingDays, calcFinish } from '@/lib/dates'

export function autoColor(name: string): string {
  const lower = name.toLowerCase()
  if (/inspection|city|hold|delay|resubmit|comments/.test(lower)) return 'red'
  if (/owner|client|move-in|furniture/.test(lower)) return 'green'
  if (/procurement|long lead|order|submittal/.test(lower)) return 'purple'
  return 'blue'
}

type TaskRecord = {
  id: string
  sortOrder: number
  durationDays: number
  startDate: Date | string
  finishDate: Date | string
  relationshipType: string
  predecessorTaskId: string | null
  lagDays: number
  isMilestone?: boolean
  parentTaskId?: string | null
  level?: number
  name?: string
}

/** Pure date math for one task given its predecessor (or null). */
export function computeTaskDates(
  task: TaskRecord,
  pred: TaskRecord | null,
  saturdayWork: boolean,
): { startDate: Date; finishDate: Date } {
  const rel = task.relationshipType || 'FS'
  const lag = task.lagDays ?? 0
  const isMil = task.isMilestone || rel === 'Milestone'

  if (!pred) {
    const start = parseDate(task.startDate)
    const finish = isMil ? start : calcFinish(start, task.durationDays, saturdayWork)
    return { startDate: start, finishDate: finish }
  }

  const pStart = parseDate(pred.startDate)
  const pFinish = parseDate(pred.finishDate)
  let start: Date
  let finish: Date

  switch (rel) {
    case 'FS':
      start = addWorkingDays(pFinish, 1 + lag, saturdayWork)
      finish = isMil ? start : calcFinish(start, task.durationDays, saturdayWork)
      break
    case 'SS':
      start = addWorkingDays(pStart, lag, saturdayWork)
      finish = isMil ? start : calcFinish(start, task.durationDays, saturdayWork)
      break
    case 'FF':
      finish = addWorkingDays(pFinish, lag, saturdayWork)
      start = isMil
        ? finish
        : addWorkingDays(finish, -(Math.max(1, task.durationDays) - 1), saturdayWork)
      break
    case 'SF':
      finish = addWorkingDays(pStart, lag, saturdayWork)
      start = isMil
        ? finish
        : addWorkingDays(finish, -(Math.max(1, task.durationDays) - 1), saturdayWork)
      break
    case 'Milestone':
      start = addWorkingDays(pFinish, 1 + lag, saturdayWork)
      finish = start
      break
    default:
      start = addWorkingDays(pFinish, 1 + lag, saturdayWork)
      finish = calcFinish(start, task.durationDays, saturdayWork)
  }

  return { startDate: start, finishDate: finish }
}

export async function recalculateDates(revisionId: string, saturdayWork: boolean) {
  const tasks = await prisma.scheduleTask.findMany({
    where: { revisionId },
    orderBy: { sortOrder: 'asc' },
  })

  const map: Record<string, (typeof tasks)[0]> = {}
  tasks.forEach(t => {
    map[t.id] = { ...t }
  })

  const visited = new Set<string>()
  const ordered: typeof tasks = []

  function visit(task: (typeof tasks)[0]) {
    if (visited.has(task.id)) return
    if (task.predecessorTaskId && map[task.predecessorTaskId]) {
      visit(map[task.predecessorTaskId])
    }
    visited.add(task.id)
    ordered.push(task)
  }
  tasks.forEach(visit)

  const updated: Array<{ id: string; startDate: Date; finishDate: Date }> = []

  for (const task of ordered) {
    if (task.relationshipType === 'Manual') continue

    const pred = task.predecessorTaskId ? map[task.predecessorTaskId] : null
    const { startDate, finishDate } = computeTaskDates(task, pred, saturdayWork)

    map[task.id] = { ...map[task.id], startDate, finishDate }
    updated.push({ id: task.id, startDate, finishDate })
  }

  await Promise.all(
    updated.map(u =>
      prisma.scheduleTask.update({
        where: { id: u.id },
        data: { startDate: u.startDate, finishDate: u.finishDate },
      }),
    ),
  )

  const parents = tasks.filter(t => tasks.some(c => c.parentTaskId === t.id))
  for (const parent of parents) {
    const children = tasks.filter(c => c.parentTaskId === parent.id)
    const childDates = children.map(c => map[c.id] ?? c)
    const minStart = new Date(
      Math.min(...childDates.map(c => parseDate(c.startDate).getTime())),
    )
    const maxFinish = new Date(
      Math.max(...childDates.map(c => parseDate(c.finishDate).getTime())),
    )
    await prisma.scheduleTask.update({
      where: { id: parent.id },
      data: { startDate: minStart, finishDate: maxFinish },
    })
    map[parent.id] = { ...map[parent.id], startDate: minStart, finishDate: maxFinish }
  }

  return prisma.scheduleTask.findMany({
    where: { revisionId },
    orderBy: { sortOrder: 'asc' },
  })
}

export function generateScheduleFromTemplate(
  templateTasks: any[],
  projectStart: Date | string,
  saturdayWork = false,
): Omit<TaskRecord, 'id'>[] {
  const sorted = [...templateTasks].sort((a, b) => a.sortOrder - b.sortOrder)
  const floor = parseDate(projectStart)
  const taskMap = new Map<string, TaskRecord>()

  for (const t of sorted) {
    const dur = t.defaultDurationDays || 1
    const predecessor = t.predecessorTemplateTaskId
      ? taskMap.get(t.predecessorTemplateTaskId) ?? null
      : null

    const stub: TaskRecord = {
      id: t.id,
      sortOrder: t.sortOrder,
      level: t.level || 1,
      name: t.name,
      startDate: floor,
      finishDate: floor,
      durationDays: dur,
      relationshipType: t.relationshipType || 'FS',
      predecessorTaskId: t.predecessorTemplateTaskId || null,
      lagDays: t.lagDays || 0,
      isMilestone: t.isMilestone || false,
      parentTaskId: null,
    }

    let startDate: Date
    let finishDate: Date

    if (!predecessor) {
      startDate = floor
      finishDate = t.isMilestone ? floor : calcFinish(floor, dur, saturdayWork)
    } else {
      const dates = computeTaskDates(stub, predecessor, saturdayWork)
      startDate = dates.startDate
      finishDate = dates.finishDate
    }

    taskMap.set(t.id, { ...stub, startDate, finishDate })
  }

  return sorted.map(t => {
    const g = taskMap.get(t.id)!
    const hasPred = Boolean(
      t.predecessorTemplateTaskId && taskMap.has(t.predecessorTemplateTaskId),
    )
    return {
      sortOrder: t.sortOrder,
      level: t.level || 1,
      name: t.name,
      durationDays: g.durationDays,
      startDate: g.startDate,
      finishDate: g.finishDate,
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
      _predTemplateId: hasPred ? t.predecessorTemplateTaskId : null,
    }
  }) as any[]
}

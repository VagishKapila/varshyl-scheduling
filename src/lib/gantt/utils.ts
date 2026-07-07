import { differenceInCalendarDays } from 'date-fns'
import { parseDate } from '@/lib/dates'
import { ROW_H } from './constants'
import type { GanttTask } from './types'

export function sortTasks(tasks: GanttTask[]): GanttTask[] {
  return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

export function buildRenderOrder(tasks: GanttTask[]): GanttTask[] {
  const byParent = new Map<string | null, GanttTask[]>()
  for (const t of tasks) {
    const key = t.parentTaskId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(t)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
  }
  const result: GanttTask[] = []
  const placed = new Set<string>()
  function appendWithChildren(task: GanttTask) {
    result.push(task)
    placed.add(task.id)
    for (const child of byParent.get(task.id) ?? []) {
      appendWithChildren(child)
    }
  }
  for (const root of byParent.get(null) ?? []) {
    appendWithChildren(root)
  }
  for (const t of sortTasks(tasks)) {
    if (!placed.has(t.id)) result.push(t)
  }
  return result
}

export function taskNestingDepth(task: GanttTask, tasks: GanttTask[]): number {
  const byId = new Map(tasks.map(t => [t.id, t]))
  let depth = 0
  let cur: string | null = task.parentTaskId
  while (cur) {
    depth++
    cur = byId.get(cur)?.parentTaskId ?? null
  }
  return depth
}

export function computeDisplayNumbers(rendered: GanttTask[]): Map<string, string> {
  const map = new Map<string, string>()
  const childCounts = new Map<string, number>()
  let rootNum = 0
  for (const t of rendered) {
    if (!t.parentTaskId) {
      rootNum++
      map.set(t.id, String(rootNum))
    } else {
      const parentNum = map.get(t.parentTaskId)
      if (!parentNum) {
        rootNum++
        map.set(t.id, String(rootNum))
        continue
      }
      const cnt = (childCounts.get(t.parentTaskId) || 0) + 1
      childCounts.set(t.parentTaskId, cnt)
      map.set(t.id, `${parentNum}.${cnt}`)
    }
  }
  return map
}

function hasChildren(tasks: GanttTask[], taskId: string): boolean {
  return tasks.some(t => t.parentTaskId === taskId)
}

export function getBarDates(task: GanttTask, tasks: GanttTask[]): { start: Date; finish: Date } {
  if (hasChildren(tasks, task.id)) {
    const children = tasks.filter(t => t.parentTaskId === task.id)
    return {
      start: new Date(Math.min(...children.map(c => parseDate(c.startDate).getTime()))),
      finish: new Date(Math.max(...children.map(c => parseDate(c.finishDate).getTime()))),
    }
  }
  return { start: parseDate(task.startDate), finish: parseDate(task.finishDate) }
}

export function dayOffsetFrom(date: Date | string, ganttStart: Date) {
  return differenceInCalendarDays(parseDate(date), ganttStart)
}

export function getTaskBarGeometry(
  task: GanttTask, rowIndex: number, tasks: GanttTask[], colPx: number, ganttStart: Date,
) {
  const barDates = getBarDates(task, tasks)
  const startOff = dayOffsetFrom(barDates.start, ganttStart) * colPx
  const dur = Math.max(1, differenceInCalendarDays(barDates.finish, barDates.start) + 1)
  const barW = task.isMilestone || task.relationshipType === 'Milestone' ? 10 : dur * colPx - 4
  const y = rowIndex * ROW_H + ROW_H / 2
  const left = startOff + 2
  const right = startOff + 2 + Math.max(barW, 4)
  return { y, left, right }
}

export function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = x1 + Math.sign(x2 - x1) * Math.max(12, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
}

export function getDragBlock(tasks: GanttTask[], taskId: string): string[] {
  const rendered = buildRenderOrder(tasks)
  const block = [taskId]
  function collectChildren(parentId: string) {
    for (const child of rendered.filter(t => t.parentTaskId === parentId)) {
      block.push(child.id)
      collectChildren(child.id)
    }
  }
  if (rendered.some(t => t.parentTaskId === taskId)) {
    collectChildren(taskId)
  }
  return block
}

export function reorderTaskList(tasks: GanttTask[], blockIds: string[], targetId: string): string[] {
  const sorted = sortTasks(tasks)
  const blockSet = new Set(blockIds)
  const blockTasks = sorted.filter(t => blockSet.has(t.id))
  const remaining = sorted.filter(t => !blockSet.has(t.id))
  const targetIdx = remaining.findIndex(t => t.id === targetId)
  const insertAt = targetIdx >= 0 ? targetIdx : remaining.length
  return [...remaining.slice(0, insertAt), ...blockTasks, ...remaining.slice(insertAt)].map(t => t.id)
}

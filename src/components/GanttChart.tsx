'use client'

import { format, addDays, differenceInCalendarDays, startOfWeek } from 'date-fns'
import { parseDate, fmt } from '@/lib/dates'
import { COLOR_HEX, type TaskColor } from '@/lib/task-color'
import {
  DRAG_COL, LEFT_FIXED_COLS, NAME_COL_DEFAULT, ROW_H, SCALE_CONFIG,
} from '@/lib/gantt/constants'
import {
  buildRenderOrder, computeDisplayNumbers, elbowPath, getBarDates, getTaskBarGeometry,
  taskNestingDepth,
} from '@/lib/gantt/utils'
import type { GanttTask } from '@/lib/gantt/types'

const HEADER_H_SINGLE = 40
const HEADER_H_WEEKLY = 48
const PHASE_BAR_H = 14
const CHILD_BAR_H = 10
const BAR_RADIUS = 3

function rowBackground(rowIndex: number) {
  return rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc'
}

function barTop(height: number) {
  return (ROW_H - height) / 2
}

function buildMonthSpans(
  ticks: Date[],
  colPx: number,
  stepDays: number,
  dayOffset: (date: Date | string) => number,
) {
  const spans: Array<{ key: string; label: string; left: number; width: number; bg: string }> = []
  let i = 0
  let bgIdx = 0
  while (i < ticks.length) {
    const m = ticks[i].getMonth()
    const y = ticks[i].getFullYear()
    let j = i + 1
    while (j < ticks.length && ticks[j].getMonth() === m && ticks[j].getFullYear() === y) j++
    spans.push({
      key: `${y}-${m}-${i}`,
      label: format(ticks[i], 'MMMM yyyy').toUpperCase(),
      left: dayOffset(ticks[i]) * colPx,
      width: (j - i) * stepDays * colPx,
      bg: bgIdx % 2 === 0 ? '#e2e8f0' : '#f1f5f9',
    })
    bgIdx++
    i = j
  }
  return spans
}

export type GanttChartProps = {
  tasks: GanttTask[]
  scale: string
  printMode?: boolean
  nameColWidth?: number
  onResizeStart?: (e: React.MouseEvent) => void
  dragBlockIds?: string[]
  dragOverId?: string | null
  onDragStart?: (taskId: string) => void
  onDragOver?: (taskId: string) => void
  onDragLeave?: (taskId: string) => void
  onDrop?: (taskId: string) => void
  onTaskClick?: (taskId: string) => void
  onCopyTask?: (taskId: string) => void
  onDeleteTask?: (taskId: string) => void
  onDragEnd?: () => void
}

export function GanttChart({
  tasks,
  scale,
  printMode = false,
  nameColWidth = NAME_COL_DEFAULT,
  onResizeStart,
  dragBlockIds = [],
  dragOverId = null,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onTaskClick,
  onCopyTask,
  onDeleteTask,
  onDragEnd,
}: GanttChartProps) {
  const renderedTasks = buildRenderOrder(tasks)
  const displayNumbers = computeDisplayNumbers(renderedTasks)
  const leftPanelWidth = LEFT_FIXED_COLS + nameColWidth
  const scaleConfig = SCALE_CONFIG[scale] || SCALE_CONFIG.weekly
  const COL_PX = scaleConfig.colPx

  const today = new Date()
  const minDate = tasks.length ? new Date(Math.min(...tasks.map(t => parseDate(t.startDate).getTime()))) : today
  const lastTaskDate = tasks.length
    ? new Date(Math.max(...tasks.map(t => parseDate(t.finishDate).getTime())))
    : addDays(today, 90)
  const ganttStart = startOfWeek(addDays(minDate, -7))
  const ganttEnd = addDays(lastTaskDate, 7)
  const totalDays = differenceInCalendarDays(ganttEnd, ganttStart)

  function dayOffset(date: Date | string) {
    return differenceInCalendarDays(parseDate(date), ganttStart)
  }

  const ticks: Date[] = []
  let tickCur = scaleConfig.alignStart(new Date(ganttStart))
  while (tickCur <= ganttEnd) {
    ticks.push(new Date(tickCur))
    tickCur = addDays(tickCur, scaleConfig.stepDays)
  }

  const isWeeklyHeader = scale === 'weekly'
  const headerHeight = isWeeklyHeader ? HEADER_H_WEEKLY : HEADER_H_SINGLE
  const monthSpans = isWeeklyHeader
    ? buildMonthSpans(ticks, COL_PX, scaleConfig.stepDays, dayOffset)
    : []

  const rowIndexById = new Map(renderedTasks.map((t, i) => [t.id, i]))
  const parentIds = new Set(tasks.filter(t => t.parentTaskId).map(t => t.parentTaskId!))
  const ganttWidth = totalDays * COL_PX
  const ganttHeight = renderedTasks.length * ROW_H

  const dependencyLines = renderedTasks.flatMap(task => {
    if (!task.predecessorTaskId || task.relationshipType === 'Manual') return []
    const predIdx = rowIndexById.get(task.predecessorTaskId)
    const succIdx = rowIndexById.get(task.id)
    if (predIdx === undefined || succIdx === undefined) return []
    const pred = renderedTasks[predIdx]
    const predGeo = getTaskBarGeometry(pred, predIdx, renderedTasks, COL_PX, ganttStart)
    const succGeo = getTaskBarGeometry(task, succIdx, renderedTasks, COL_PX, ganttStart)
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

  return (
    <div className={printMode ? 'overflow-visible' : 'flex-1 overflow-auto'}>
      <div style={{ minWidth: leftPanelWidth + totalDays * COL_PX }}>
        <div
          className={`flex ${printMode ? '' : 'sticky top-0 z-10'} border-b border-gray-200`}
          style={{ height: headerHeight }}
        >
          <div
            className="flex-shrink-0 border-r border-gray-200 relative bg-gray-50"
            style={{ width: leftPanelWidth }}
          >
            <div
              className="grid text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 h-full items-center"
              style={{ gridTemplateColumns: `${DRAG_COL}px 28px ${nameColWidth}px 48px 76px 76px 72px` }}
            >
              <span />
              <span>#</span>
              <span className="relative pr-2">
                Task Name
                {!printMode && onResizeStart && (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={onResizeStart}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-orange-300/60 active:bg-orange-400/80"
                  />
                )}
              </span>
              <span>Days</span><span>Start</span><span>Finish</span><span>Party</span>
            </div>
          </div>
          <div className="relative flex-1 bg-gray-50" style={{ height: headerHeight }}>
            {isWeeklyHeader ? (
              <>
                <div className="relative" style={{ height: 22 }}>
                  {monthSpans.map(span => (
                    <div
                      key={span.key}
                      className="absolute top-0 bottom-0 flex items-center px-1 border-r border-slate-300"
                      style={{
                        left: span.left,
                        width: span.width,
                        background: span.bg,
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: '#334155',
                      }}
                    >
                      {span.label}
                    </div>
                  ))}
                </div>
                <div className="relative border-t border-gray-200" style={{ height: 26 }}>
                  {ticks.map((tick, i) => (
                    <div
                      key={`week-day-${i}`}
                      className="absolute font-medium"
                      style={{
                        left: dayOffset(tick) * COL_PX + 2,
                        top: 6,
                        fontSize: 9,
                        color: '#64748b',
                      }}
                    >
                      {format(tick, 'd')}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              ticks.map((tick, i) => (
                <div
                  key={`${scale}-${i}`}
                  className="absolute text-xs text-gray-400 font-medium whitespace-nowrap"
                  style={{ left: dayOffset(tick) * COL_PX + 2, top: 12 }}
                >
                  {scaleConfig.formatLabel(tick)}
                </div>
              ))
            )}
            {!printMode && (
              <div
                className="absolute top-0 bottom-0 w-0.5 z-10"
                style={{ left: dayOffset(today) * COL_PX, background: '#f15a24' }}
              />
            )}
          </div>
        </div>

        <div className="relative">
          <svg
            className={`absolute pointer-events-none ${printMode ? '' : 'no-print'}`}
            style={{ left: leftPanelWidth, top: 0, width: ganttWidth, height: ganttHeight, zIndex: 10 }}
            aria-hidden
          >
            {dependencyLines}
          </svg>

          {renderedTasks.map((task, rowIndex) => {
            const isParent = parentIds.has(task.id)
            const isPhase = !task.parentTaskId && isParent
            const isChild = Boolean(task.parentTaskId)
            const barDates = getBarDates(task, tasks)
            const startOff = dayOffset(barDates.start) * COL_PX
            const dur = Math.max(1, differenceInCalendarDays(barDates.finish, barDates.start) + 1)
            const isMil = task.isMilestone || task.relationshipType === 'Milestone'
            const barW = isMil ? 10 : dur * COL_PX - 4
            const barColor = COLOR_HEX[task.color as TaskColor] ?? COLOR_HEX.blue
            const nameColor = isPhase ? '#ffffff' : barColor
            const indentPx = taskNestingDepth(task, tasks) * 22
            const displayNum = displayNumbers.get(task.id) || '—'
            const isDragging = dragBlockIds.includes(task.id)
            const isDragOver = dragOverId === task.id
            const altBg = rowBackground(rowIndex)
            const nextTask = renderedTasks[rowIndex + 1]
            const nextIsPhase = Boolean(
              nextTask && !nextTask.parentTaskId && parentIds.has(nextTask.id),
            )
            const phaseSeparator = nextIsPhase
            const summaryBar = isPhase || isParent

            return (
              <div
                key={task.id}
                className={`group gantt-row flex ${
                  printMode ? '' : 'cursor-pointer'
                } ${isPhase ? 'gantt-row-phase font-bold' : ''} ${
                  task.isCritical ? 'ring-inset ring-1 ring-red-200' : ''
                } ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'bg-orange-50' : ''}`}
                style={{
                  height: ROW_H,
                  borderBottom: phaseSeparator ? '2px solid #cbd5e1' : '1px solid #f1f5f9',
                }}
                onDragOver={printMode ? undefined : e => { e.preventDefault(); onDragOver?.(task.id) }}
                onDragLeave={printMode ? undefined : () => onDragLeave?.(task.id)}
                onDrop={printMode ? undefined : e => { e.preventDefault(); e.stopPropagation(); onDrop?.(task.id) }}
                onClick={printMode ? undefined : () => onTaskClick?.(task.id)}
              >
                <div
                  className={`flex-shrink-0 border-r border-gray-200 flex items-center px-2 gantt-left-panel ${
                    isPhase ? 'bg-gray-900 text-white hover:bg-gray-800' : ''
                  }`}
                  style={{
                    width: leftPanelWidth,
                    background: isPhase ? undefined : altBg,
                  }}
                >
                  <div
                    className="grid items-center gap-1 w-full text-xs"
                    style={{ gridTemplateColumns: `${DRAG_COL - 4}px 24px ${nameColWidth}px 44px 76px 76px 72px` }}
                  >
                    {!printMode ? (
                      <span
                        draggable
                        onDragStart={e => { e.stopPropagation(); onDragStart?.(task.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={onDragEnd}
                        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none text-center no-print"
                        title="Drag to reorder"
                        onClick={e => e.stopPropagation()}
                      >⠿</span>
                    ) : <span />}
                    <span className="text-gray-400">{displayNum}</span>
                    <span
                      className={`flex items-center gap-1 min-w-0 ${
                        isPhase ? 'font-bold text-white' :
                        isParent ? 'font-semibold text-blue-900' :
                        'font-medium text-gray-800'
                      }`}
                      style={{ paddingLeft: isChild ? indentPx + 8 : indentPx }}
                    >
                      {isMil && <span className="shrink-0" style={{ color: barColor }}>◆</span>}
                      <span className="task-name truncate flex-1 block" style={{ color: nameColor }} title={task.name}>{task.name}</span>
                      {!printMode && (
                        <span className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onCopyTask?.(task.id) }}
                            className="px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 border border-orange-200 rounded hover:bg-orange-50"
                          >Copy</button>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onDeleteTask?.(task.id) }}
                            className="px-1.5 py-0.5 text-[10px] font-semibold text-red-600 border border-red-200 rounded hover:bg-red-50"
                          >Delete</button>
                        </span>
                      )}
                    </span>
                    <span className={isPhase ? 'text-gray-300 text-center' : 'text-gray-500 text-center'}>{task.durationDays}d</span>
                    <span className={isPhase ? 'text-gray-300' : 'text-gray-500'}>{fmt(barDates.start)}</span>
                    <span className={isPhase ? 'text-gray-300' : 'text-gray-500'}>{fmt(barDates.finish)}</span>
                    <span className={isPhase ? 'text-gray-400 truncate' : 'text-gray-400 truncate'}>{task.responsibleParty || ''}</span>
                  </div>
                </div>

                <div
                  className="relative flex-shrink-0"
                  style={{ height: ROW_H, width: ganttWidth, zIndex: 2, background: altBg }}
                >
                  {ticks.map((tick, wi) => (
                    <div
                      key={`grid-${scale}-${wi}`}
                      className="absolute top-0 bottom-0 w-px bg-gray-100"
                      style={{ left: dayOffset(tick) * COL_PX }}
                    />
                  ))}
                  {!printMode && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5"
                      style={{ left: dayOffset(today) * COL_PX, background: '#f15a24', opacity: 0.4 }}
                    />
                  )}

                  {isMil ? (
                    <div className="absolute" style={{
                      left: startOff + 5, top: 10,
                      width: 12, height: 12,
                      background: barColor,
                      transform: 'rotate(45deg)',
                    }} />
                  ) : summaryBar ? (
                    <div
                      className="absolute flex items-center overflow-hidden gantt-bar"
                      style={{
                        left: startOff + 2,
                        top: barTop(PHASE_BAR_H),
                        width: Math.max(barW, 4),
                        height: PHASE_BAR_H,
                        borderRadius: BAR_RADIUS,
                        background: isPhase ? '#111' : '#2458ff',
                        opacity: isPhase ? 1 : 0.9,
                      }}
                    >
                      {barW >= 60 && (
                        <span className="px-1 text-[10px] font-semibold text-white truncate block w-full" style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}>{task.name}</span>
                      )}
                    </div>
                  ) : (
                    <div
                      className="absolute flex items-center overflow-hidden gantt-bar"
                      style={{
                        left: startOff + 2,
                        top: barTop(CHILD_BAR_H),
                        width: Math.max(barW, 4),
                        height: CHILD_BAR_H,
                        borderRadius: BAR_RADIUS,
                        background: barColor,
                        opacity: task.isCritical ? 1 : 0.85,
                      }}
                    >
                      {barW >= 60 && (
                        <span className="px-1 text-[10px] font-semibold text-white truncate block w-full" style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}>{task.name}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {!printMode && Array.from({ length: 5 }).map((_, i) => {
            const rowIndex = renderedTasks.length + i
            const altBg = rowBackground(rowIndex)
            return (
            <div
              key={`empty-${i}`}
              className="gantt-row gantt-row-empty flex"
              style={{ height: ROW_H, borderBottom: '1px solid #f1f5f9', background: altBg }}
            >
              <div
                className="flex-shrink-0 border-r border-gray-200 flex items-center px-2"
                style={{ width: leftPanelWidth, background: altBg }}
              >
                <div
                  className="grid items-center gap-1 w-full text-xs text-gray-300"
                  style={{ gridTemplateColumns: `${DRAG_COL - 4}px 24px ${nameColWidth}px 44px 76px 76px 72px` }}
                >
                  <span />
                  <span className="text-center">{renderedTasks.length + i + 1}</span>
                  <span /><span /><span /><span />
                </div>
              </div>
              <div className="flex-1" style={{ background: altBg }} />
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function GanttLegend({ printMode = false }: { printMode?: boolean }) {
  return (
    <div className={`px-4 py-2 flex gap-4 flex-wrap text-xs border-b border-gray-100 bg-gray-50 print-legend ${printMode ? '' : 'no-print'}`}>
      {[
        { color: '#2458ff', label: 'Construction Tasks' },
        { color: '#d71920', label: 'Inspections / Holds / City' },
        { color: '#138a36', label: 'Owner / Client' },
        { color: '#168c9a', label: 'Contingency / Delay' },
        { color: '#7a3cff', label: 'Procurement' },
        { color: '#111', label: 'Phase Summary' },
      ].map(l => (
        <div key={l.label} className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
          <span className="text-gray-600">{l.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rotate-45 inline-block" style={{ background: '#111' }} />
        <span className="text-gray-600">Milestone</span>
      </div>
    </div>
  )
}

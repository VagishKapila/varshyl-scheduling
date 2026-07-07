import { format, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from 'date-fns'

export const COLOR_MAP: Record<string, string> = {
  blue: '#2458ff', red: '#d71920', green: '#138a36',
  teal: '#168c9a', purple: '#7a3cff', black: '#111111',
}

export const SCALE_CONFIG: Record<string, {
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

export const NAME_COL_STORAGE = 'gantt-name-col-width'
export const NAME_COL_MIN = 180
export const NAME_COL_MAX = 400
export const NAME_COL_DEFAULT = 260
export const DRAG_COL = 20
export const ROW_H = 32
export const LEFT_FIXED_COLS = DRAG_COL + 28 + 48 + 76 + 76 + 72

export const LEGEND_ITEMS = [
  { color: '#2458ff', label: 'Construction Tasks' },
  { color: '#d71920', label: 'Inspections / Holds / City' },
  { color: '#138a36', label: 'Owner / Client' },
  { color: '#168c9a', label: 'Contingency / Delay' },
  { color: '#7a3cff', label: 'Procurement' },
  { color: '#111', label: 'Phase Summary' },
]

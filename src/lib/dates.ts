import { finishFromStart } from './scheduling'

/** Parse YYYY-MM-DD (or ISO) as local calendar date — avoids UTC midnight shift. */
export function parseLocalDate(dateStr: string | Date): Date {
  if (dateStr instanceof Date) {
    return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate())
  }
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** yyyy-MM-dd for `<input type="date">`. */
export function toDateInputValue(date: string | Date): string {
  const d = parseLocalDate(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** M/d/yy display — single source for Gantt rows and drawer labels. */
export function formatDisplayDate(date: string | Date): string {
  const d = parseLocalDate(date)
  const yy = String(d.getFullYear()).slice(2)
  return `${d.getMonth() + 1}/${d.getDate()}/${yy}`
}

/** Client-side finish from start + duration, respecting saturdayWork. */
export function finishFromStartLocal(
  start: string | Date,
  durationDays: number,
  saturdayWork: boolean,
): Date {
  const days = Math.max(1, durationDays || 1)
  return finishFromStart(parseLocalDate(start), days, saturdayWork)
}

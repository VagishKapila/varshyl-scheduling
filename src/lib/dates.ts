// Parse a date from API without timezone shift
export function parseDate(val: string | Date): Date {
  if (val instanceof Date) return val
  const s = val.includes('T') ? val.split('T')[0] : val
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d) // local midnight — no UTC shift
}

// Format for display in Gantt rows and drawer
export function fmt(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)}`
}

// Format for HTML date input value="YYYY-MM-DD"
export function fmtInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Add N working days (saturdayWork=true counts Saturday)
export function addWorkingDays(date: Date, days: number, saturdayWork: boolean): Date {
  if (days === 0) return new Date(date)
  const dir = days > 0 ? 1 : -1
  let remaining = Math.abs(days)
  let current = new Date(date)
  while (remaining > 0) {
    current.setDate(current.getDate() + dir)
    const dow = current.getDay()
    if (dow === 0) continue // always skip Sunday
    if (dow === 6 && !saturdayWork) continue // skip Saturday if not working
    remaining--
  }
  return current
}

// Calc finish from start + duration
export function calcFinish(start: Date, durationDays: number, saturdayWork: boolean): Date {
  return addWorkingDays(start, Math.max(1, durationDays) - 1, saturdayWork)
}

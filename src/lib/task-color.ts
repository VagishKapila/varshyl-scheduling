export type TaskColor = 'blue' | 'red' | 'green' | 'teal' | 'purple' | 'black'

const COLOR_RULES: Array<{ keywords: string[]; color: TaskColor }> = [
  { keywords: ['inspection', 'city', 'hold', 'resubmit', 'comments', 'permit'], color: 'red' },
  { keywords: ['owner', 'client', 'move-in', 'furniture', 'occupan'], color: 'green' },
  { keywords: ['contingency', 'delay', 'weather', 'unforeseen'], color: 'teal' },
  { keywords: ['procurement', 'long lead', 'order', 'submittal', 'material'], color: 'purple' },
]

export function getAutoColor(taskName: string): TaskColor {
  const lower = taskName.toLowerCase()
  for (const rule of COLOR_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.color
    }
  }
  return 'blue'
}

export const COLOR_HEX: Record<TaskColor, string> = {
  blue: '#2458ff',
  red: '#d71920',
  green: '#138a36',
  teal: '#168c9a',
  purple: '#7a3cff',
  black: '#111111',
}

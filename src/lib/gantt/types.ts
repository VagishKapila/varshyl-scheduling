export interface GanttTask {
  id: string
  sortOrder: number
  level: number
  name: string
  durationDays: number
  startDate: string
  finishDate: string
  color: string
  responsibleParty: string | null
  notes: string | null
  isPermitRelated: boolean
  isCritical: boolean
  isMilestone: boolean
  predecessorTaskId: string | null
  relationshipType: string
  lagDays: number
  parentTaskId: string | null
}

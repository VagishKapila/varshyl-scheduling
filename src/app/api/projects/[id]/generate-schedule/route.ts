import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateScheduleFromTemplate, autoColor } from '@/lib/scheduling'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = (session.user as any).id
    const companyId = (session.user as any).companyId

    const project = await prisma.project.findFirst({ where: { id: params.id, companyId } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { templateId, selectedTaskIds, revisionName } = await req.json()

    const template = await prisma.template.findUnique({
      where: { id: templateId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    const isNoPermit = ['no-permit', 'emergency'].includes(project.permitStatus)
    let tasksToUse: any[] = selectedTaskIds?.length
      ? template.tasks.filter((t: any) => selectedTaskIds.includes(t.id))
      : [...template.tasks]

    if (isNoPermit) tasksToUse = tasksToUse.filter((t: any) => !t.isPermitRelated)

    const adjustedTasks = tasksToUse.map((t: any) => ({
      ...t,
      defaultDurationDays: t.isPermitRelated && project.permitDays > 0
        ? project.permitDays
        : t.defaultDurationDays,
    }))

    // Mark existing revisions not current
    await prisma.scheduleRevision.updateMany({
      where: { projectId: project.id },
      data: { isCurrent: false },
    })

    const revision = await prisma.scheduleRevision.create({
      data: {
        projectId: project.id,
        revisionName: revisionName || 'Rev 1',
        notes: `Generated from template: ${template.name}`,
        createdBy: userId,
        isCurrent: true,
      },
    })

    const generatedTasks = generateScheduleFromTemplate(
      adjustedTasks, project.startDate, project.saturdayWork
    ) as any[]

    const idMap = new Map<string, string>()
    const insertedTasks: any[] = []

    for (const t of generatedTasks) {
      const predId = t._predTemplateId ? (idMap.get(t._predTemplateId) ?? null) : null
      const created = await prisma.scheduleTask.create({
        data: {
          revisionId: revision.id,
          sortOrder: t.sortOrder,
          level: t.level,
          name: t.name,
          durationDays: t.durationDays,
          startDate: t.startDate,
          finishDate: t.finishDate,
          relationshipType: t.relationshipType,
          predecessorTaskId: predId,
          lagDays: t.lagDays,
          color: t.color || autoColor(t.name),
          responsibleParty: t.responsibleParty || null,
          isPermitRelated: t.isPermitRelated || false,
          isMilestone: t.isMilestone || false,
          isCritical: false,
        },
      })
      idMap.set(t._templateId, created.id)
      insertedTasks.push(created)
    }

    await prisma.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } })
    return NextResponse.json({ data: { revision, tasks: insertedTasks } })
  } catch (e: any) {
    console.error('[POST generate-schedule]', e.message)
    return NextResponse.json({ error: 'Failed to generate schedule' }, { status: 500 })
  }
}

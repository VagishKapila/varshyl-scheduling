import { prisma } from '@/lib/prisma'

export type FixRevisionReport = {
  projectId: string
  projectName: string
  action: 'ok' | 'fixed' | 'skipped'
  message: string
  previousCurrentId?: string
  newCurrentId?: string
  taskCount?: number
}

export async function fixBlankRevisions(): Promise<FixRevisionReport[]> {
  const reports: FixRevisionReport[] = []
  const projects = await prisma.project.findMany()

  for (const project of projects) {
    const revisions = await prisma.scheduleRevision.findMany({
      where: { projectId: project.id },
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: 'desc' },
    })

    if (revisions.length === 0) {
      reports.push({
        projectId: project.id,
        projectName: project.name,
        action: 'skipped',
        message: 'No revisions',
      })
      continue
    }

    const currentRevision = revisions.find(r => r.isCurrent)
    const currentTaskCount = currentRevision?._count.tasks ?? 0

    if (currentTaskCount > 0) {
      reports.push({
        projectId: project.id,
        projectName: project.name,
        action: 'ok',
        message: `Current revision has ${currentTaskCount} tasks`,
        previousCurrentId: currentRevision?.id,
        taskCount: currentTaskCount,
      })
      continue
    }

    const bestRevision = revisions
      .filter(r => r._count.tasks > 0)
      .sort((a, b) => b._count.tasks - a._count.tasks)[0]

    if (!bestRevision) {
      reports.push({
        projectId: project.id,
        projectName: project.name,
        action: 'skipped',
        message: 'No revision with tasks',
        previousCurrentId: currentRevision?.id,
      })
      continue
    }

    await prisma.scheduleRevision.updateMany({
      where: { projectId: project.id },
      data: { isCurrent: false },
    })

    await prisma.scheduleRevision.update({
      where: { id: bestRevision.id },
      data: { isCurrent: true },
    })

    reports.push({
      projectId: project.id,
      projectName: project.name,
      action: 'fixed',
      message: `Set current → ${bestRevision.revisionName} (${bestRevision._count.tasks} tasks)`,
      previousCurrentId: currentRevision?.id,
      newCurrentId: bestRevision.id,
      taskCount: bestRevision._count.tasks,
    })
  }

  return reports
}

export async function inspectProjectRevisions(projectId: string) {
  const revisions = await prisma.scheduleRevision.findMany({
    where: { projectId },
    include: { _count: { select: { tasks: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return revisions.map(r => ({
    id: r.id,
    revisionName: r.revisionName,
    isCurrent: r.isCurrent,
    createdAt: r.createdAt,
    taskCount: r._count.tasks,
  }))
}

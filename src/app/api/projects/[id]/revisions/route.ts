import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const TASK_COPY_FIELDS = [
  'sortOrder',
  'level',
  'name',
  'durationDays',
  'startDate',
  'finishDate',
  'relationshipType',
  'lagDays',
  'color',
  'responsibleParty',
  'notes',
  'isPermitRelated',
  'isCritical',
  'isMilestone',
] as const

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const revisions = await prisma.scheduleRevision.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ data: revisions })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = (session.user as any).id
    const { revisionName, notes } = await req.json()

    const currentRevision = await prisma.scheduleRevision.findFirst({
      where: { projectId: params.id, isCurrent: true },
    })

    await prisma.scheduleRevision.updateMany({
      where: { projectId: params.id },
      data: { isCurrent: false },
    })

    const revision = await prisma.scheduleRevision.create({
      data: {
        projectId: params.id,
        revisionName: revisionName || 'New Revision',
        notes: notes || null,
        createdBy: userId,
        isCurrent: true,
      },
    })

    if (currentRevision) {
      const oldTasks = await prisma.scheduleTask.findMany({
        where: { revisionId: currentRevision.id },
        orderBy: { sortOrder: 'asc' },
      })

      const idMap: Record<string, string> = {}

      for (const task of oldTasks) {
        const data: Record<string, unknown> = {
          revisionId: revision.id,
          parentTaskId: null,
          predecessorTaskId: null,
        }
        for (const key of TASK_COPY_FIELDS) {
          data[key] = task[key as keyof typeof task]
        }
        const newTask = await prisma.scheduleTask.create({ data: data as any })
        idMap[task.id] = newTask.id
      }

      for (const task of oldTasks) {
        await prisma.scheduleTask.update({
          where: { id: idMap[task.id] },
          data: {
            parentTaskId: task.parentTaskId ? idMap[task.parentTaskId] ?? null : null,
            predecessorTaskId: task.predecessorTaskId
              ? idMap[task.predecessorTaskId] ?? null
              : null,
          },
        })
      }
    }

    const tasks = await prisma.scheduleTask.findMany({
      where: { revisionId: revision.id },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ data: { ...revision, tasks } })
  } catch (e: any) {
    console.error('[POST revisions]', e.message)
    return NextResponse.json({ error: 'Failed to save revision' }, { status: 500 })
  }
}

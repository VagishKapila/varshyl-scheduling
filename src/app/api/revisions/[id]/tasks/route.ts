import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { autoColor } from '@/lib/scheduling'
import { parseDate, calcFinish } from '@/lib/dates'

async function resolveInsertSort(
  revisionId: string,
  body: {
    sortOrder?: number
    predecessorTaskId?: string | null
    parentTaskId?: string | null
    insertAfterTaskId?: string | null
  },
): Promise<{ insertSort: number; level: number }> {
  if (body.sortOrder != null) {
    return { insertSort: body.sortOrder, level: 1 }
  }

  if (body.insertAfterTaskId) {
    const after = await prisma.scheduleTask.findFirst({
      where: { id: body.insertAfterTaskId, revisionId },
    })
    if (after) return { insertSort: after.sortOrder + 1, level: after.level }
  }

  if (body.predecessorTaskId) {
    const pred = await prisma.scheduleTask.findFirst({
      where: { id: body.predecessorTaskId, revisionId },
    })
    if (pred) return { insertSort: pred.sortOrder + 1, level: pred.level }
  }

  if (body.parentTaskId) {
    const parent = await prisma.scheduleTask.findFirst({
      where: { id: body.parentTaskId, revisionId },
    })
    if (parent) {
      const children = await prisma.scheduleTask.findMany({
        where: { revisionId, parentTaskId: body.parentTaskId },
        orderBy: { sortOrder: 'desc' },
        take: 1,
      })
      const insertSort = children.length
        ? children[0].sortOrder + 1
        : parent.sortOrder + 1
      return { insertSort, level: parent.level + 1 }
    }
  }

  const maxSort = await prisma.scheduleTask.aggregate({
    where: { revisionId },
    _max: { sortOrder: true },
  })
  return { insertSort: (maxSort._max.sortOrder ?? 0) + 1, level: body.parentTaskId ? 2 : 1 }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const tasks = await prisma.scheduleTask.findMany({
      where: { revisionId: params.id },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json({ data: tasks })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const { name, durationDays, startDate } = body
    if (!name || !startDate) return NextResponse.json({ error: 'Name and start date required' }, { status: 400 })
    const revision = await prisma.scheduleRevision.findUnique({
      where: { id: params.id },
      include: { project: true },
    })
    if (!revision) return NextResponse.json({ error: 'Revision not found' }, { status: 404 })

    const { insertSort, level: resolvedLevel } = await resolveInsertSort(params.id, body)
    const level = body.level ?? resolvedLevel

    await prisma.scheduleTask.updateMany({
      where: { revisionId: params.id, sortOrder: { gte: insertSort } },
      data: { sortOrder: { increment: 1 } },
    })

    const dur = Math.max(1, Number(durationDays) || 1)
    const start = parseDate(startDate)
    const finish = body.isMilestone
      ? start
      : calcFinish(start, dur, revision.project.saturdayWork)
    const task = await prisma.scheduleTask.create({
      data: {
        revisionId: params.id,
        parentTaskId: body.parentTaskId || null,
        name: name.trim(),
        durationDays: dur,
        startDate: start,
        finishDate: finish,
        level,
        sortOrder: insertSort,
        color: body.color || autoColor(name),
        responsibleParty: body.responsibleParty || null,
        notes: body.notes || null,
        isPermitRelated: body.isPermitRelated || false,
        isMilestone: body.isMilestone || false,
        relationshipType: body.relationshipType || 'FS',
        predecessorTaskId: body.predecessorTaskId || null,
        lagDays: body.lagDays || 0,
      },
    })
    return NextResponse.json({ data: task })
  } catch (e: any) {
    console.error('[POST tasks]', e.message)
    return NextResponse.json({ error: 'Failed to add task' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json() // expects array of { id, ...fields }
    const results = []
    for (const update of body) {
      const { id, ...data } = update
      if (data.startDate) data.startDate = parseDate(data.startDate)
      if (data.finishDate) data.finishDate = parseDate(data.finishDate)
      const t = await prisma.scheduleTask.update({ where: { id }, data })
      results.push(t)
    }
    return NextResponse.json({ data: results })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to update tasks' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { autoColor, addWorkingDays } from '@/lib/scheduling'

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
    const { name, durationDays, startDate, level, sortOrder } = body
    if (!name || !startDate) return NextResponse.json({ error: 'Name and start date required' }, { status: 400 })
    const revision = await prisma.scheduleRevision.findUnique({
      where: { id: params.id },
      include: { project: true },
    })
    if (!revision) return NextResponse.json({ error: 'Revision not found' }, { status: 404 })

    const maxSort = await prisma.scheduleTask.aggregate({
      where: { revisionId: params.id },
      _max: { sortOrder: true },
    })

    const dur = Number(durationDays) || 1
    const start = new Date(startDate)
    const finish = body.isMilestone
      ? start
      : addWorkingDays(start, dur - 1, revision.project.saturdayWork)
    const task = await prisma.scheduleTask.create({
      data: {
        revisionId: params.id,
        name: name.trim(),
        durationDays: dur,
        startDate: start,
        finishDate: finish,
        level: level || 1,
        sortOrder: sortOrder ?? ((maxSort._max.sortOrder ?? 0) + 1),
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
      if (data.startDate) data.startDate = new Date(data.startDate)
      if (data.finishDate) data.finishDate = new Date(data.finishDate)
      const t = await prisma.scheduleTask.update({ where: { id }, data })
      results.push(t)
    }
    return NextResponse.json({ data: results })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to update tasks' }, { status: 500 })
  }
}

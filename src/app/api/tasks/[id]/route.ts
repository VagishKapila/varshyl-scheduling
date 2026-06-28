import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { autoColor } from '@/lib/scheduling'
import { parseDate, fmtInput, calcFinish } from '@/lib/dates'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await prisma.scheduleTask.findUnique({
      where: { id: params.id },
      include: { revision: { include: { project: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const body = await req.json()
    const saturdayWork = existing.revision.project.saturdayWork
    const isMilestone =
      body.relationshipType === 'Milestone' ||
      body.isMilestone === true ||
      existing.relationshipType === 'Milestone' ||
      existing.isMilestone

    if (body.durationDays !== undefined && body.durationDays < 1 && !isMilestone) {
      return NextResponse.json({ error: 'Duration must be at least 1 day' }, { status: 400 })
    }

    const data: Record<string, unknown> = { ...body }

    if (data.startDate) {
      data.startDate = parseDate(String(data.startDate))
    }

    const rel = (data.relationshipType as string) ?? existing.relationshipType
    const isManual = rel === 'Manual'
    const dur = Math.max(1, Number(data.durationDays ?? existing.durationDays) || 1)

    if (!isManual && data.startDate) {
      const start = data.startDate as Date
      data.finishDate = isMilestone ? start : calcFinish(start, dur, saturdayWork)
    } else if (data.finishDate) {
      data.finishDate = parseDate(String(data.finishDate))
    }

    if (data.name && !data.color) {
      data.color = autoColor(String(data.name))
    }

    const task = await prisma.scheduleTask.update({
      where: { id: params.id },
      data,
    })

    return NextResponse.json({
      data: {
        ...task,
        startDate: fmtInput(task.startDate),
        finishDate: fmtInput(task.finishDate),
      },
    })
  } catch (e: any) {
    console.error('[PATCH task]', e.message)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const task = await prisma.scheduleTask.findUnique({ where: { id: params.id } })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    await prisma.scheduleTask.delete({ where: { id: params.id } })
    await prisma.scheduleTask.updateMany({
      where: { revisionId: task.revisionId, sortOrder: { gt: task.sortOrder } },
      data: { sortOrder: { decrement: 1 } },
    })
    return NextResponse.json({ data: { deleted: true } })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}

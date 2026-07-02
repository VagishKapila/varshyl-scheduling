import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { autoColor, recalculateDates } from '@/lib/scheduling'
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

    const rel = body.relationshipType ?? existing.relationshipType
    const isManual = rel === 'Manual'
    const dur = Math.max(1, Number(body.durationDays ?? existing.durationDays) || 1)

    let startDate = body.startDate ? parseDate(body.startDate) : existing.startDate
    let finishDate = body.finishDate ? parseDate(body.finishDate) : existing.finishDate

    if (!isManual && body.startDate) {
      startDate = parseDate(body.startDate)
      finishDate = isMilestone ? startDate : calcFinish(startDate, dur, saturdayWork)
    } else if (body.finishDate) {
      finishDate = parseDate(body.finishDate)
    }

    const name = body.name ?? existing.name
    const color = body.color ?? (body.name ? autoColor(body.name) : existing.color)

    await prisma.scheduleTask.update({
      where: { id: params.id },
      data: {
        name,
        durationDays: isMilestone ? (body.durationDays ?? existing.durationDays) : dur,
        startDate,
        finishDate,
        relationshipType: rel,
        predecessorTaskId:
          body.predecessorTaskId !== undefined
            ? body.predecessorTaskId
            : existing.predecessorTaskId,
        lagDays: body.lagDays ?? existing.lagDays,
        color,
        responsibleParty:
          body.responsibleParty !== undefined
            ? body.responsibleParty
            : existing.responsibleParty,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        isMilestone: body.isMilestone ?? existing.isMilestone,
        isPermitRelated: body.isPermitRelated ?? existing.isPermitRelated,
        isCritical: body.isCritical ?? existing.isCritical,
        parentTaskId:
          body.parentTaskId !== undefined ? body.parentTaskId : existing.parentTaskId,
      },
    })

    const tasks = await recalculateDates(existing.revisionId, saturdayWork)

    return NextResponse.json({
      data: {
        tasks: tasks.map(t => ({
          ...t,
          startDate: fmtInput(t.startDate),
          finishDate: fmtInput(t.finishDate),
        })),
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

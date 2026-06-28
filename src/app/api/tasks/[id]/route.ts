import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { autoColor } from '@/lib/scheduling'
import { parseLocalDate } from '@/lib/dates'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()

    if (body.durationDays !== undefined && body.durationDays < 1) {
      const isMilestone =
        body.relationshipType === 'Milestone' || body.isMilestone === true
      if (!isMilestone) {
        return NextResponse.json({ error: 'Duration must be at least 1 day' }, { status: 400 })
      }
    }

    if (body.startDate) body.startDate = parseLocalDate(body.startDate)
    if (body.finishDate) body.finishDate = parseLocalDate(body.finishDate)
    if (body.name && !body.color) body.color = autoColor(body.name)
    const task = await prisma.scheduleTask.update({ where: { id: params.id }, data: body })
    return NextResponse.json({ data: task })
  } catch (e: any) {
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

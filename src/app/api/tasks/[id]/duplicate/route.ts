import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const original = await prisma.scheduleTask.findUnique({ where: { id: params.id } })
    if (!original) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const insertSort = original.sortOrder + 1

    await prisma.scheduleTask.updateMany({
      where: { revisionId: original.revisionId, sortOrder: { gte: insertSort } },
      data: { sortOrder: { increment: 1 } },
    })

    const copy = await prisma.scheduleTask.create({
      data: {
        revisionId: original.revisionId,
        parentTaskId: original.parentTaskId,
        sortOrder: insertSort,
        level: original.level,
        name: `${original.name} (Copy)`,
        durationDays: original.durationDays,
        startDate: original.startDate,
        finishDate: original.finishDate,
        relationshipType: original.relationshipType,
        predecessorTaskId: null,
        lagDays: original.lagDays,
        color: original.color,
        responsibleParty: original.responsibleParty,
        notes: original.notes,
        isPermitRelated: original.isPermitRelated,
        isCritical: original.isCritical,
        isMilestone: original.isMilestone,
      },
    })

    return NextResponse.json({ data: copy })
  } catch (e: any) {
    console.error('[POST duplicate]', e.message)
    return NextResponse.json({ error: 'Failed to duplicate task' }, { status: 500 })
  }
}

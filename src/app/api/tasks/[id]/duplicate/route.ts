import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function taskCopyData(source: any, overrides: Record<string, unknown> = {}) {
  return {
    revisionId: source.revisionId,
    parentTaskId: source.parentTaskId,
    sortOrder: source.sortOrder,
    level: source.level,
    name: `${source.name} (Copy)`,
    durationDays: source.durationDays,
    startDate: source.startDate,
    finishDate: source.finishDate,
    relationshipType: source.relationshipType,
    predecessorTaskId: source.predecessorTaskId as string | null,
    lagDays: source.lagDays,
    color: source.color,
    responsibleParty: source.responsibleParty,
    notes: source.notes,
    isPermitRelated: source.isPermitRelated,
    isCritical: source.isCritical,
    isMilestone: source.isMilestone,
    ...overrides,
  }
}

function remapPredecessor(
  predecessorTaskId: string | null,
  idMap: Map<string, string>,
): string | null {
  if (!predecessorTaskId) return null
  return idMap.get(predecessorTaskId) ?? predecessorTaskId
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const original = await prisma.scheduleTask.findUnique({ where: { id: params.id } })
    if (!original) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const children = await prisma.scheduleTask.findMany({
      where: { parentTaskId: original.id },
      orderBy: { sortOrder: 'asc' },
    })

    const blockSize = 1 + children.length
    const insertSort = original.sortOrder + 1

    await prisma.scheduleTask.updateMany({
      where: { revisionId: original.revisionId, sortOrder: { gte: insertSort } },
      data: { sortOrder: { increment: blockSize } },
    })

    const idMap = new Map<string, string>()

    const newParent = await prisma.scheduleTask.create({
      data: taskCopyData(original, {
        parentTaskId: original.parentTaskId,
        sortOrder: insertSort,
        predecessorTaskId: original.predecessorTaskId,
      }),
    })
    idMap.set(original.id, newParent.id)

    const createdChildren = []
    for (const child of children) {
      const newChild = await prisma.scheduleTask.create({
        data: taskCopyData(child, {
          parentTaskId: newParent.id,
          sortOrder: child.sortOrder + 1,
          predecessorTaskId: remapPredecessor(child.predecessorTaskId, idMap),
        }),
      })
      idMap.set(child.id, newChild.id)
      createdChildren.push(newChild)
    }

    return NextResponse.json({
      data: { parent: newParent, children: createdChildren, taskCount: 1 + createdChildren.length },
    })
  } catch (e: any) {
    console.error('[POST duplicate]', e.message)
    return NextResponse.json({ error: 'Failed to duplicate task' }, { status: 500 })
  }
}

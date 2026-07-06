import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const revision = await prisma.scheduleRevision.findUnique({ where: { id: params.id } })
    if (!revision) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const allTasks = await prisma.scheduleTask.findMany({
      where: { revisionId: params.id },
      orderBy: { sortOrder: 'asc' },
    })

    const referencedAsPredecessor = new Set(
      allTasks.map(t => t.predecessorTaskId).filter(Boolean) as string[],
    )
    const parentIds = new Set(allTasks.map(t => t.parentTaskId).filter(Boolean) as string[])

    const orphans = allTasks.filter(t =>
      !t.parentTaskId &&
      !t.predecessorTaskId &&
      !referencedAsPredecessor.has(t.id) &&
      !parentIds.has(t.id) &&
      t.sortOrder > 5,
    )

    if (orphans.length) {
      await prisma.scheduleTask.deleteMany({
        where: { id: { in: orphans.map(o => o.id) } },
      })
    }

    return NextResponse.json({
      data: {
        deleted: orphans.length,
        tasks: orphans.map(o => ({ id: o.id, name: o.name, sortOrder: o.sortOrder })),
      },
    })
  } catch (e: any) {
    console.error('[POST cleanup]', e.message)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}

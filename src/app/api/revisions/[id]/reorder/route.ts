import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { taskIds } = await req.json()
    if (!Array.isArray(taskIds) || !taskIds.length) {
      return NextResponse.json({ error: 'taskIds array required' }, { status: 400 })
    }

    const revision = await prisma.scheduleRevision.findUnique({
      where: { id: params.id },
      include: { tasks: true },
    })
    if (!revision) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existingIds = new Set(revision.tasks.map(t => t.id))
    if (taskIds.length !== revision.tasks.length || taskIds.some((id: string) => !existingIds.has(id))) {
      return NextResponse.json({ error: 'taskIds must include every task in the revision' }, { status: 400 })
    }

    await prisma.$transaction(
      taskIds.map((id: string, index: number) =>
        prisma.scheduleTask.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    )

    const tasks = await prisma.scheduleTask.findMany({
      where: { revisionId: params.id },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ data: tasks })
  } catch (e: any) {
    console.error('[PATCH reorder]', e.message)
    return NextResponse.json({ error: 'Failed to reorder tasks' }, { status: 500 })
  }
}

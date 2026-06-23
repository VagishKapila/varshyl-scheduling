import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recalculateDates } from '@/lib/scheduling'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const revision = await prisma.scheduleRevision.findUnique({
      where: { id: params.id },
      include: { tasks: { orderBy: { sortOrder: 'asc' } }, project: true },
    })
    if (!revision) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const recalculated = recalculateDates(
      revision.tasks.map((t: any) => ({
        ...t,
        startDate: new Date(t.startDate),
        finishDate: new Date(t.finishDate),
      })),
      revision.project.saturdayWork
    )

    for (const t of recalculated) {
      await prisma.scheduleTask.update({
        where: { id: t.id },
        data: { startDate: t.startDate, finishDate: t.finishDate },
      })
    }

    return NextResponse.json({ data: recalculated })
  } catch (e: any) {
    console.error('[POST recalculate]', e.message)
    return NextResponse.json({ error: 'Recalculation failed' }, { status: 500 })
  }
}

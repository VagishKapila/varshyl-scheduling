import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recalculateDates } from '@/lib/scheduling'
import { parseLocalDate } from '@/lib/dates'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        revisions: {
          where: { isCurrent: true },
          include: { tasks: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const floor = parseLocalDate(project.startDate)
    let updated = 0

    for (const revision of project.revisions) {
      if (!revision.tasks.length) continue
      const recalculated = recalculateDates(
        revision.tasks.map(t => ({
          ...t,
          startDate: parseLocalDate(t.startDate),
          finishDate: parseLocalDate(t.finishDate),
        })),
        project.saturdayWork,
        floor,
      )
      for (const t of recalculated) {
        await prisma.scheduleTask.update({
          where: { id: t.id },
          data: { startDate: t.startDate, finishDate: t.finishDate },
        })
        updated++
      }
    }

    return NextResponse.json({ data: { tasksUpdated: updated } })
  } catch (e: any) {
    console.error('[POST recalculate-all]', e.message)
    return NextResponse.json({ error: 'Recalculation failed' }, { status: 500 })
  }
}

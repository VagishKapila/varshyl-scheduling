import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { addWorkingDays, parseDate } from '@/lib/dates'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { holdName, durationDays, insertAfterTaskId, shiftMode } = await req.json()
    // shiftMode: 'all' | 'branch' | 'none'

    const revision = await prisma.scheduleRevision.findUnique({
      where: { id: params.id },
      include: { tasks: { orderBy: { sortOrder: 'asc' } }, project: true },
    })
    if (!revision) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const afterTask = revision.tasks.find((t: any) => t.id === insertAfterTaskId)
    if (!afterTask) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const holdStart = parseDate(afterTask.finishDate)
    const holdFinish = addWorkingDays(holdStart, durationDays, revision.project.saturdayWork)

    // Insert hold task
    const maxSort = Math.max(...revision.tasks.map((t: any) => t.sortOrder))
    const holdTask = await prisma.scheduleTask.create({
      data: {
        revisionId: params.id,
        name: holdName || 'Hold',
        durationDays,
        startDate: holdStart,
        finishDate: holdFinish,
        level: afterTask.level,
        sortOrder: afterTask.sortOrder + 1,
        color: 'red',
        isPermitRelated: false,
        isMilestone: false,
        relationshipType: 'FS',
        predecessorTaskId: insertAfterTaskId,
        lagDays: 0,
      },
    })

    // Shift downstream tasks if requested
    if (shiftMode !== 'none') {
      const downstream = revision.tasks.filter((t: any) => t.sortOrder > afterTask.sortOrder)
      for (const t of downstream) {
        const newStart = addWorkingDays(parseDate(t.startDate), durationDays, revision.project.saturdayWork)
        const newFinish = addWorkingDays(parseDate(t.finishDate), durationDays, revision.project.saturdayWork)
        await prisma.scheduleTask.update({
          where: { id: t.id },
          data: { startDate: newStart, finishDate: newFinish },
        })
      }
    }

    return NextResponse.json({ data: holdTask })
  } catch (e: any) {
    console.error('[POST add-hold]', e.message)
    return NextResponse.json({ error: 'Failed to add hold' }, { status: 500 })
  }
}

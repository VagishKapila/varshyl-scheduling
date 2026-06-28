import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recalculateDates } from '@/lib/scheduling'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: { revisions: { where: { isCurrent: true } } },
    })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let updated = 0
    for (const revision of project.revisions) {
      const tasks = await recalculateDates(revision.id, project.saturdayWork)
      updated += tasks.length
    }

    return NextResponse.json({ data: { tasksUpdated: updated } })
  } catch (e: any) {
    console.error('[POST recalculate-all]', e.message)
    return NextResponse.json({ error: 'Recalculation failed' }, { status: 500 })
  }
}

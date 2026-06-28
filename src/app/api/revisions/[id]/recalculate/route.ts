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
      include: { project: true },
    })
    if (!revision) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const tasks = await recalculateDates(params.id, revision.project.saturdayWork)
    return NextResponse.json({ data: tasks })
  } catch (e: any) {
    console.error('[POST recalculate]', e.message)
    return NextResponse.json({ error: 'Recalculation failed' }, { status: 500 })
  }
}

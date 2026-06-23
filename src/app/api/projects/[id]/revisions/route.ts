import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const revisions = await prisma.scheduleRevision.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ data: revisions })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = (session.user as any).id
    const { revisionName, notes, tasks } = await req.json()

    // Mark all current revisions as not current
    await prisma.scheduleRevision.updateMany({
      where: { projectId: params.id },
      data: { isCurrent: false },
    })

    const revision = await prisma.scheduleRevision.create({
      data: { projectId: params.id, revisionName, notes, createdBy: userId, isCurrent: true },
    })

    if (tasks?.length) {
      await prisma.scheduleTask.createMany({
        data: tasks.map((t: any) => ({ ...t, revisionId: revision.id })),
      })
    }

    return NextResponse.json({ data: revision })
  } catch (e: any) {
    console.error('[POST revisions]', e.message)
    return NextResponse.json({ error: 'Failed to save revision' }, { status: 500 })
  }
}

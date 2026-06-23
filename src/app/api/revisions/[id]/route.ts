import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const revision = await prisma.scheduleRevision.findUnique({
      where: { id: params.id },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        project: { include: { company: true } },
      },
    })
    if (!revision) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data: revision })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const entries = await prisma.lookAheadEntry.findMany({
      where: { task: { revisionId: params.id } },
    })
    const byTaskId = Object.fromEntries(entries.map(e => [e.taskId, e]))
    return NextResponse.json({ data: byTaskId })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const FIELDS = ['trade', 'constraints', 'inspections', 'materials'] as const

export async function PATCH(req: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const task = await prisma.scheduleTask.findUnique({ where: { id: params.taskId } })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const body = await req.json()
    const data: Record<string, string | null> = {}
    for (const key of FIELDS) {
      if (key in body) {
        const val = body[key]
        data[key] = val === '' || val == null ? null : String(val)
      }
    }

    const entry = await prisma.lookAheadEntry.upsert({
      where: { taskId: params.taskId },
      create: { taskId: params.taskId, ...data },
      update: data,
    })

    return NextResponse.json({ data: entry })
  } catch (e: any) {
    console.error('[PATCH lookahead]', e.message)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseDate } from '@/lib/dates'

async function getCompanyId(session: any) {
  return (session?.user as any)?.companyId
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const companyId = await getCompanyId(session)
    const project = await prisma.project.findFirst({
      where: { id: params.id, companyId },
      include: { revisions: { orderBy: { createdAt: 'desc' } }, company: true },
    })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data: project })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const companyId = await getCompanyId(session)
    const body = await req.json()
    if (body.startDate) body.startDate = parseDate(body.startDate)
    if (body.targetEndDate) body.targetEndDate = parseDate(body.targetEndDate)
    const project = await prisma.project.updateMany({
      where: { id: params.id, companyId },
      data: { ...body, updatedAt: new Date() },
    })
    return NextResponse.json({ data: project })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const companyId = await getCompanyId(session)
    await prisma.project.updateMany({
      where: { id: params.id, companyId },
      data: { status: 'archived' },
    })
    return NextResponse.json({ data: { archived: true } })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

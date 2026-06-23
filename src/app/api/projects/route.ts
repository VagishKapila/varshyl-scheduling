import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const companyId = (session.user as any).companyId
    if (!companyId) return NextResponse.json({ data: [] })
    const projects = await prisma.project.findMany({
      where: { companyId },
      include: { revisions: { where: { isCurrent: true }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ data: projects })
  } catch (e: any) {
    console.error('[GET /api/projects]', e.message)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const companyId = (session.user as any).companyId
    if (!companyId) return NextResponse.json({ error: 'Complete onboarding first' }, { status: 400 })
    const body = await req.json()
    const { name, clientName, address, projectType, startDate, targetEndDate, permitStatus, permitDays, saturdayWork, doubleShift } = body
    if (!name || !clientName || !projectType || !startDate) {
      return NextResponse.json({ error: 'Required fields missing' }, { status: 400 })
    }
    const project = await prisma.project.create({
      data: {
        companyId,
        name: name.trim(),
        clientName: clientName.trim(),
        address: (address || '').trim(),
        projectType,
        startDate: new Date(startDate),
        targetEndDate: new Date(targetEndDate || startDate),
        permitStatus: permitStatus || 'standard',
        permitDays: Number(permitDays) || 0,
        saturdayWork: Boolean(saturdayWork),
        doubleShift: Boolean(doubleShift),
      },
    })
    return NextResponse.json({ data: project })
  } catch (e: any) {
    console.error('[POST /api/projects]', e.message)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}

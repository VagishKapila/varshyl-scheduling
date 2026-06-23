import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = (session.user as any).id
    const { companyName, logoUrl, footerText } = await req.json()
    if (!companyName) return NextResponse.json({ error: 'Company name required' }, { status: 400 })
    const company = await prisma.company.create({
      data: { name: companyName.trim(), logoUrl: logoUrl || null, footerText: footerText || null },
    })
    await prisma.companyUser.create({ data: { companyId: company.id, userId, role: 'owner' } })
    return NextResponse.json({ data: company })
  } catch (e: any) {
    console.error('[POST /api/onboarding]', e.message)
    return NextResponse.json({ error: 'Onboarding failed' }, { status: 500 })
  }
}

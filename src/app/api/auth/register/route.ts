import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json()
    if (!email || !password || !name) return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'Password min 6 chars' }, { status: 400 })
    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (exists) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), name: name.trim(), passwordHash },
    })
    return NextResponse.json({ data: { id: user.id, email: user.email, name: user.name } })
  } catch (e: any) {
    console.error('[POST /api/auth/register]', e.message)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}

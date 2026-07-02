import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fixBlankRevisions } from '@/lib/fix-blank-revisions'

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const reports = await fixBlankRevisions()
    const fixed = reports.filter(r => r.action === 'fixed')
    const ok = reports.filter(r => r.action === 'ok')

    return NextResponse.json({
      data: {
        summary: {
          total: reports.length,
          fixed: fixed.length,
          ok: ok.length,
          skipped: reports.filter(r => r.action === 'skipped').length,
        },
        reports,
      },
    })
  } catch (e: any) {
    console.error('[POST admin/fix-revisions]', e.message)
    return NextResponse.json({ error: 'Fix failed' }, { status: 500 })
  }
}

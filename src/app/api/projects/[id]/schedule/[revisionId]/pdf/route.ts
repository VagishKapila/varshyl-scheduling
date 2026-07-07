import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function parseRequestCookies(cookieHeader: string, baseUrl: string) {
  const url = new URL(baseUrl)
  return cookieHeader
    .split(';')
    .map(c => c.trim())
    .filter(Boolean)
    .map(c => {
      const eq = c.indexOf('=')
      if (eq === -1) return null
      const name = c.slice(0, eq).trim()
      const value = c.slice(eq + 1).trim()
      if (!name) return null
      return { name, value, url: url.origin }
    })
    .filter((c): c is { name: string; value: string; url: string } => c !== null)
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; revisionId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, revisionId } = params
  const companyId = (session.user as { companyId?: string }).companyId

  const revision = await prisma.scheduleRevision.findFirst({
    where: {
      id: revisionId,
      projectId: id,
      project: { companyId: companyId ?? undefined },
    },
    include: { project: true },
  })
  if (!revision) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const scale = req.nextUrl.searchParams.get('scale') ?? 'weekly'
  const lookahead = req.nextUrl.searchParams.get('lookahead') ?? 'false'
  const schedule = req.nextUrl.searchParams.get('schedule') ?? 'true'
  const printUrl = `${baseUrl}/projects/${id}/schedule/${revisionId}/print?scale=${encodeURIComponent(scale)}&lookahead=${encodeURIComponent(lookahead)}&schedule=${encodeURIComponent(schedule)}`

  let puppeteer: typeof import('puppeteer')
  try {
    puppeteer = await import('puppeteer')
  } catch {
    return NextResponse.json(
      { error: 'PDF generation requires puppeteer with Chromium.' },
      { status: 500 },
    )
  }

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ?? process.env.CHROME_BIN ?? undefined

  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  })

  try {
    const page = await browser.newPage()

    const cookieHeader = req.headers.get('cookie') ?? ''
    if (cookieHeader) {
      const cookies = parseRequestCookies(cookieHeader, baseUrl)
      if (cookies.length > 0) {
        await page.setCookie(...cookies)
      }
    }

    await page.goto(printUrl, { waitUntil: 'networkidle0', timeout: 30_000 })
    await page.waitForSelector('.print-gantt-bar', { timeout: 10_000 })

    const pdf = await page.pdf({
      format: 'A3',
      landscape: true,
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    })

    const safeName = (revision.project?.name ?? 'schedule')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'schedule'

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}-${revisionId}.pdf"`,
      },
    })
  } catch (e) {
    console.error('[schedule-pdf]', e)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  } finally {
    await browser.close()
  }
}

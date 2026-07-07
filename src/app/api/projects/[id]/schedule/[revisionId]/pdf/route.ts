import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import puppeteer from 'puppeteer-core'

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

  const port = process.env.PORT ?? 8080
  const baseUrl = `http://localhost:${port}`
  const gantUrl = `${baseUrl}/projects/${id}/schedule/${revisionId}?pdfmode=true`

  try {
    const browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: true,
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

      await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 })
      await page.goto(gantUrl, { waitUntil: 'networkidle0', timeout: 30_000 })

      await page.waitForSelector('[class*="gantt"]', { timeout: 15_000 })
      await new Promise(resolve => setTimeout(resolve, 2000))

      const pdf = await page.pdf({
        format: 'A3',
        landscape: true,
        printBackground: true,
        margin: { top: '0.3in', right: '0.2in', bottom: '0.3in', left: '0.2in' },
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
    } finally {
      await browser.close().catch(() => {})
    }
  } catch (err) {
    console.error('[PDF ERROR]', err)
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}

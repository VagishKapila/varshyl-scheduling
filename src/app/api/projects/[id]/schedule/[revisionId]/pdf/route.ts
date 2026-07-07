import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

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

  const baseUrl = `http://localhost:${process.env.PORT ?? 8080}`
  const printUrl = `${baseUrl}/projects/${id}/schedule/${revisionId}?pdfmode=true`

  try {
    chromium.setGraphicsMode = false

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
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

      await page.goto(printUrl, { waitUntil: 'networkidle0', timeout: 30_000 })
      await page.waitForSelector('.gantt-bar', { timeout: 10_000 })

      await page.setViewport({ width: 1600, height: 900 })

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

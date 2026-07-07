'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { GanttChart, GanttLegend } from '@/components/GanttChart'
import { sortTasks } from '@/lib/gantt/utils'
import type { GanttTask } from '@/lib/gantt/types'

function PrintHeader({ project, revision, company }: {
  project: any
  revision: any
  company: any
}) {
  const today = new Date()
  return (
    <div className="print-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: 8, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {company?.logoUrl && <img src={company.logoUrl} alt="Logo" style={{ height: 44, objectFit: 'contain' }} />}
        <div>
          <div style={{ fontWeight: 900, fontSize: 13 }}>{company?.name}</div>
          <div style={{ fontWeight: 700, fontSize: 11 }}>{project?.name}</div>
          <div style={{ fontSize: 9, color: '#444' }}>{project?.clientName} — {project?.address}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 9, color: '#444' }}>
        <div style={{ fontWeight: 700 }}>Schedule Revision: {revision?.revisionName}</div>
        <div>Issued: {format(today, 'MMM d, yyyy')}</div>
      </div>
    </div>
  )
}

function PrintFooter({ revision, company }: { revision: any; company: any }) {
  return (
    <div className="print-footer" style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #111', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#444' }}>
      <span>{company?.footerText || 'COMPANY CONFIDENTIAL | For project coordination only'}</span>
      <span>Revision: {revision?.revisionName}</span>
    </div>
  )
}

export default function PrintPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const revisionId = params.revisionId as string

  const [revision, setRevision] = useState<any>(null)
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const scale = searchParams.get('scale') ?? 'weekly'

  const loadData = useCallback(async (revId: string) => {
    const res = await fetch(`/api/revisions/${revId}`)
    const data = await res.json()
    if (!res.ok || !data.data) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setRevision(data.data)
    setTasks(sortTasks(data.data.tasks || []))
    setNotFound(false)
    setLoading(false)
  }, [])

  useEffect(() => {
    async function resolveAndLoad() {
      if (revisionId === 'latest') {
        const res = await fetch(`/api/projects/${projectId}`)
        const data = await res.json()
        const current = data.data?.revisions?.find((r: any) => r.isCurrent) ?? data.data?.revisions?.[0]
        if (current?.id) {
          const qs = searchParams.toString()
          router.replace(`/projects/${projectId}/schedule/${current.id}/print${qs ? `?${qs}` : ''}`)
          return
        }
        setNotFound(true)
        setLoading(false)
        return
      }
      await loadData(revisionId)
    }
    resolveAndLoad()
  }, [revisionId, projectId, router, loadData, searchParams])

  function handleSavePdf() {
    const qs = searchParams.toString()
    window.location.href = `/api/projects/${projectId}/schedule/${revisionId}/pdf${qs ? `?${qs}` : ''}`
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (notFound || !revision) return <div className="p-8 text-red-500">Revision not found</div>

  const project = revision.project
  const company = project?.company

  return (
    <div className="print-container print-page" style={{ fontFamily: 'Arial, sans-serif', fontSize: 9, color: '#111', background: 'white', padding: 16 }}>
      <div className="print-toolbar no-print mb-4 flex gap-3 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
        <Link href={`/projects/${projectId}/schedule/${revisionId}`} className="text-sm text-gray-600 hover:underline">← Back to Gantt</Link>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.print()} className="px-4 py-2 rounded-lg text-white text-sm font-bold" style={{ background: '#111' }}>
            Print PDF
          </button>
          <button onClick={handleSavePdf} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50">
            Save as PDF
          </button>
        </div>
      </div>

      <PrintHeader project={project} revision={revision} company={company} />
      <GanttLegend printMode />
      <GanttChart
        tasks={tasks}
        scale={scale}
        printMode
      />
      <PrintFooter revision={revision} company={company} />
    </div>
  )
}

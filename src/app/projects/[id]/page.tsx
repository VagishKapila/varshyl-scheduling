'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(d => { setProject(d.data); setLoading(false) })
  }, [id])

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading…</div>
  if (!project) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Project not found</div>

  const currentRevision = project.revisions?.find((r: any) => r.isCurrent)
  const allRevisions = [...(project.revisions || [])].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-gray-700 text-sm">← Dashboard</Link>
        <span className="text-gray-300">|</span>
        <h1 className="font-bold text-gray-900">{project.name}</h1>
        <span className="text-gray-400 text-sm">— {project.clientName}</span>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">Project Info</h2>
            {[
              ['Address', project.address],
              ['Type', project.projectType],
              ['Start', format(new Date(project.startDate), 'MMM d, yyyy')],
              ['Target End', format(new Date(project.targetEndDate), 'MMM d, yyyy')],
              ['Permit', project.permitStatus],
              ['Saturday Work', project.saturdayWork ? 'Yes' : 'No'],
            ].map(([k,v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
                <span className="text-gray-500">{k}</span>
                <span className="font-medium text-gray-900">{v}</span>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">Revisions</h2>
            {allRevisions.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">No revisions yet</div>
            ) : (
              <div className="space-y-2">
                {allRevisions.map((r: any) => (
                  <Link key={r.id} href={`/projects/${id}/schedule/${r.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50 cursor-pointer">
                      <div>
                        <div className="font-semibold text-sm text-gray-900">{r.revisionName}</div>
                        <div className="text-xs text-gray-500">{format(new Date(r.createdAt), 'MMM d, yyyy h:mm a')}</div>
                      </div>
                      {r.isCurrent && <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full font-semibold">Current</span>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          {currentRevision ? (
            <Link href={`/projects/${id}/schedule/${currentRevision.id}`}>
              <button className="px-6 py-3 rounded-lg font-bold text-white" style={{background:'#f15a24'}}>
                Open Current Schedule →
              </button>
            </Link>
          ) : (
            <Link href={`/projects/${id}/template`}>
              <button className="px-6 py-3 rounded-lg font-bold text-white" style={{background:'#f15a24'}}>
                Create Schedule →
              </button>
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}

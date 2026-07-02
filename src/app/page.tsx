'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { signOut } from 'next-auth/react'

interface Project {
  id: string; name: string; clientName: string; address: string
  projectType: string; status: string; updatedAt: string
  revisions: { id: string; revisionName: string; createdAt: string; isCurrent?: boolean }[]
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated') {
      if ((session.user as any).needsOnboarding) { router.push('/onboarding'); return }
      fetchProjects()
    }
  }, [status])

  async function fetchProjects() {
    const res = await fetch('/api/projects')
    const data = await res.json()
    setProjects(data.data || [])
    setLoading(false)
  }

  async function archiveProject(id: string) {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    fetchProjects()
  }

  async function duplicateProject(p: Project) {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, name: `${p.name} (Copy)` }),
    })
    const data = await res.json()
    if (data.data) fetchProjects()
  }

  const active = projects.filter(p => p.status === 'active')
  const archived = projects.filter(p => p.status === 'archived')

  if (status === 'loading' || loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg" style={{background:'linear-gradient(135deg,#f15a24 0 45%,#111 45% 68%,#ffc400 68%)'}} />
          <span className="font-black text-lg text-gray-900">Varshyl Scheduling</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{session?.user?.name}</span>
          <Link href="/projects/new">
            <button className="px-4 py-2 rounded-lg text-white font-bold text-sm" style={{background:'#f15a24'}}>
              + New Project
            </button>
          </Link>
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Projects', value: projects.length },
            { label: 'Active', value: active.length },
            { label: 'Archived', value: archived.length },
            { label: 'This Month', value: projects.filter(p => new Date(p.updatedAt) > new Date(Date.now() - 30*86400000)).length },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">{m.value}</div>
              <div className="text-xs text-gray-500 mt-1 font-semibold uppercase tracking-wide">{m.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Projects</h1>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <div className="text-5xl mb-4">🏗️</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No projects yet</h2>
            <p className="text-gray-500 mb-6">Create your first construction schedule</p>
            <Link href="/projects/new">
              <button className="px-6 py-3 rounded-lg text-white font-bold" style={{background:'#f15a24'}}>
                Create First Schedule
              </button>
            </Link>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {active.map(p => {
              const rev = p.revisions?.[0]
              return (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 transition-all hover:shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">{p.name}</h3>
                      <p className="text-sm text-gray-500">{p.clientName}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${p.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mb-1">{p.address}</div>
                  <span className="inline-block text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold mb-3">
                    {p.projectType.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                  </span>
                  {rev && (
                    <div className="text-xs text-gray-500 mb-3">
                      Latest: <span className="font-semibold text-gray-700">{rev.revisionName}</span>
                      <span className="ml-2">{format(new Date(rev.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mb-4">Updated {format(new Date(p.updatedAt), 'MMM d, yyyy')}</div>
                  <div className="flex gap-2 flex-wrap">
                    <Link href={`/projects/${p.id}`}>
                      <button className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white" style={{background:'#111'}}>Open</button>
                    </Link>
                    <button onClick={() => duplicateProject(p)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Duplicate</button>
                    <Link href={rev?.id ? `/projects/${p.id}/schedule/${rev.id}/print` : '#'}>
                      <button className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">PDF</button>
                    </Link>
                    <button onClick={() => archiveProject(p.id)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Archive</button>
                  </div>
                </div>
              )
            })}
          </div>
          {archived.length > 0 && (
            <div className="mt-10">
              <h2 className="text-lg font-bold text-gray-700 mb-4">Archived</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {archived.map(p => {
                  const rev = p.revisions?.[0]
                  return (
                    <div key={p.id} className="bg-gray-50 rounded-xl border border-gray-200 p-5 opacity-80">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-gray-700 text-base">{p.name}</h3>
                          <p className="text-sm text-gray-500">{p.clientName}</p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full font-semibold bg-gray-200 text-gray-600">Archived</span>
                      </div>
                      {rev && (
                        <div className="text-xs text-gray-500 mb-3">
                          Latest: <span className="font-semibold">{rev.revisionName}</span>
                        </div>
                      )}
                      <Link href={`/projects/${p.id}`}>
                        <button className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-white">View</button>
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          </>
        )}
      </main>
    </div>
  )
}

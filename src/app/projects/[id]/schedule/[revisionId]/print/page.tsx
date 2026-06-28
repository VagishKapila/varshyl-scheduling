'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format, differenceInCalendarDays, addDays, startOfWeek, startOfDay, isValid } from 'date-fns'

const COLOR_MAP: Record<string,string> = {
  blue:'#2458ff', red:'#d71920', green:'#138a36',
  teal:'#168c9a', purple:'#7a3cff', black:'#111',
}
const COL_PX = 18

export default function PrintPage() {
  const params = useParams()
  const projectId = params.id as string
  const revisionId = params.revisionId as string
  const [revision, setRevision] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/revisions/${revisionId}`)
      .then(r => r.json())
      .then(d => { setRevision(d.data); setLoading(false) })
  }, [revisionId])

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (!revision) return <div className="p-8 text-red-500">Revision not found</div>

  const tasks = [...(revision.tasks || [])].sort((a:any,b:any) => a.sortOrder - b.sortOrder)
  const project = revision.project
  const company = project?.company
  const today = startOfDay(new Date())

  function fmtDate(d: string | Date, pattern = 'M/d/yy') {
    const parsed = startOfDay(new Date(d))
    return isValid(parsed) ? format(parsed, pattern) : ''
  }

  function taskInLookahead(t: any): boolean {
    const s = startOfDay(new Date(t.startDate))
    const f = startOfDay(new Date(t.finishDate))
    if (!isValid(s) || !isValid(f)) return false
    const twoWeekCutoff = startOfDay(addDays(today, 14))
    return (
      (s >= today && s <= twoWeekCutoff) ||
      (f >= today && f <= twoWeekCutoff) ||
      (s <= today && f >= today)
    )
  }

  const twoWeekCutoff = startOfDay(addDays(today, 14))
  const lookaheadTasks = tasks.filter(taskInLookahead)

  const minDate = tasks.length ? new Date(Math.min(...tasks.map((t:any) => new Date(t.startDate).getTime()))) : today
  const maxDate = tasks.length ? new Date(Math.max(...tasks.map((t:any) => new Date(t.finishDate).getTime()))) : addDays(today, 90)
  const ganttStart = startOfWeek(addDays(minDate, -7))
  const ganttEnd = addDays(maxDate, 14)
  const totalDays = differenceInCalendarDays(ganttEnd, ganttStart)

  function dayOffset(date: Date | string) {
    return differenceInCalendarDays(new Date(date), ganttStart)
  }

  const weeks: Date[] = []
  let cur = new Date(ganttStart)
  while (cur <= ganttEnd) { weeks.push(new Date(cur)); cur = addDays(cur, 7) }

  return (
    <div style={{fontFamily:'Arial,sans-serif',fontSize:10,color:'#111',background:'white',padding:'0.35in'}}>
      {/* Screen-only nav */}
      <div className="no-print mb-4 flex gap-3 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
        <Link href={`/projects/${projectId}/schedule/${revisionId}`} className="text-sm text-gray-600 hover:underline">← Back to Gantt</Link>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.print()} className="px-4 py-2 rounded-lg text-white text-sm font-bold" style={{background:'#111'}}>🖨 Print PDF</button>
          <button onClick={() => {
            const url = new URL(window.location.href)
            url.searchParams.set('lookahead','1')
            window.open(url.toString(), '_blank')
          }} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold">Print 2-Week Look-Ahead</button>
        </div>
      </div>

      {/* HEADER */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',borderBottom:'2px solid #111',paddingBottom:8,marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {company?.logoUrl && <img src={company.logoUrl} alt="Logo" style={{height:48,objectFit:'contain'}} />}
          <div>
            <div style={{fontWeight:900,fontSize:14}}>{company?.name}</div>
            <div style={{fontWeight:700,fontSize:12}}>{project?.name}</div>
            <div style={{fontSize:10,color:'#444'}}>{project?.clientName} — {project?.address}</div>
          </div>
        </div>
        <div style={{textAlign:'right',fontSize:10,color:'#444'}}>
          <div style={{fontWeight:700}}>Schedule Revision: {revision.revisionName}</div>
          <div>Date Issued: {format(today,'MMM d, yyyy')}</div>
          <div>Start: {format(new Date(project.startDate),'MMM d, yyyy')}</div>
          <div>Target End: {format(new Date(project.targetEndDate),'MMM d, yyyy')}</div>
        </div>
      </div>

      {/* Legend */}
      <div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:8,fontSize:9}}>
        {Object.entries({blue:'Construction',red:'Inspection/Hold/City',green:'Owner/Client',teal:'Contingency',purple:'Procurement',black:'Phase Summary'}).map(([c,l])=>(
          <span key={c} style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:COLOR_MAP[c],display:'inline-block'}}/>
            {l}
          </span>
        ))}
      </div>

      {/* Gantt table */}
      <div style={{border:'1px solid #111',borderRadius:4,overflow:'hidden'}}>
        {/* Date header */}
        <div style={{display:'flex',background:'#f2f4f7',borderBottom:'1px solid #ccc',height:28}}>
          <div style={{width:420,flexShrink:0,borderRight:'1px solid #ccc',display:'flex',alignItems:'center',paddingLeft:6,fontSize:9,fontWeight:700,color:'#475467',textTransform:'uppercase',letterSpacing:'0.04em'}}>
            <span style={{width:20}}>#</span>
            <span style={{flex:1}}>Task Name</span>
            <span style={{width:36,textAlign:'center'}}>Days</span>
            <span style={{width:56}}>Start</span>
            <span style={{width:56}}>Finish</span>
          </div>
          <div style={{flex:1,position:'relative',overflow:'hidden'}}>
            {weeks.map((w,i)=>(
              <div key={i} style={{position:'absolute',left:dayOffset(w)*COL_PX+2,top:8,fontSize:8,color:'#667085',fontWeight:600}}>
                {format(w,'M/d')}
              </div>
            ))}
            <div style={{position:'absolute',top:0,bottom:0,width:2,background:'#f15a24',left:dayOffset(today)*COL_PX}} />
          </div>
        </div>

        {tasks.map((task:any,i:number)=>{
          const isPhase = task.level === 0
          const dur = Math.max(1, differenceInCalendarDays(new Date(task.finishDate), new Date(task.startDate))+1)
          const barW = task.isMilestone ? 8 : Math.max(dur * COL_PX - 2, 4)
          const barColor = COLOR_MAP[task.color] || '#2458ff'
          const indent = task.level * 14

          return (
            <div key={task.id} style={{
              display:'flex',borderBottom:'1px solid #eaecf0',
              height:22,background:isPhase?'#f8f9fb':'white',
            }}>
              <div style={{width:420,flexShrink:0,borderRight:'1px solid #eaecf0',display:'flex',alignItems:'center',
                paddingLeft:6+indent,fontSize:9,color:isPhase?'#111':'#344054',fontWeight:isPhase?700:400}}>
                <span style={{width:20,color:'#98a2b3',flexShrink:0}}>{i+1}</span>
                <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {task.isMilestone&&<span style={{color:barColor,marginRight:2}}>◆</span>}{task.name}
                </span>
                <span style={{width:36,textAlign:'center',flexShrink:0}}>{task.durationDays}d</span>
                <span style={{width:56,flexShrink:0}}>{fmtDate(task.startDate)}</span>
                <span style={{width:56,flexShrink:0}}>{fmtDate(task.finishDate)}</span>
              </div>
              <div style={{flex:1,position:'relative'}}>
                {weeks.map((_,wi)=>(
                  <div key={wi} style={{position:'absolute',top:0,bottom:0,width:1,background:'#f0f0f0',left:dayOffset(weeks[wi])*COL_PX}} />
                ))}
                <div style={{position:'absolute',top:0,bottom:0,width:1.5,background:'#f15a24',opacity:0.5,left:dayOffset(today)*COL_PX}} />
                {task.isMilestone ? (
                  <div style={{position:'absolute',left:dayOffset(task.startDate)*COL_PX+3,top:6,
                    width:10,height:10,background:barColor,transform:'rotate(45deg)'}} />
                ) : (
                  <div style={{
                    position:'absolute',
                    left:dayOffset(task.startDate)*COL_PX+1,
                    top:isPhase?9:6,
                    width:barW,
                    height:isPhase?4:10,
                    background:barColor,
                    borderRadius:2,
                  }} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 2-Week Look-Ahead (same page, after gantt) */}
      <div style={{marginTop:24,pageBreakBefore:'always'}}>
        <div style={{fontWeight:900,fontSize:13,borderBottom:'2px solid #111',paddingBottom:4,marginBottom:10}}>
          2-Week Look-Ahead — {format(today,'MMM d')} to {format(twoWeekCutoff,'MMM d, yyyy')}
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:9}}>
          <thead>
            <tr style={{background:'#f2f4f7'}}>
              {['Task','Trade / Responsible','Start','Finish','Constraints / Notes','Inspections','Materials'].map(h=>(
                <th key={h} style={{border:'1px solid #d0d5dd',padding:'4px 6px',textAlign:'left',fontWeight:700,textTransform:'uppercase',fontSize:8,letterSpacing:'0.04em'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lookaheadTasks.length === 0 ? (
              <tr><td colSpan={7} style={{padding:'12px 6px',textAlign:'center',color:'#667085'}}>No tasks starting in the next 2 weeks</td></tr>
            ) : lookaheadTasks.map((t:any)=>(
              <tr key={t.id} style={{background:t.isCritical?'#fff5f5':'white'}}>
                <td style={{border:'1px solid #eaecf0',padding:'3px 6px',fontWeight:t.isMilestone?700:400}}>
                  {t.isMilestone&&'◆ '}{t.name}
                </td>
                <td style={{border:'1px solid #eaecf0',padding:'3px 6px'}}>{t.responsibleParty||'—'}</td>
                <td style={{border:'1px solid #eaecf0',padding:'3px 6px'}}>{fmtDate(t.startDate, 'M/d')}</td>
                <td style={{border:'1px solid #eaecf0',padding:'3px 6px'}}>{fmtDate(t.finishDate, 'M/d')}</td>
                <td style={{border:'1px solid #eaecf0',padding:'3px 6px'}}>{t.notes||'—'}</td>
                <td style={{border:'1px solid #eaecf0',padding:'3px 6px'}}>{t.isPermitRelated?'✓ Required':'—'}</td>
                <td style={{border:'1px solid #eaecf0',padding:'3px 6px'}}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FOOTER */}
      <div style={{marginTop:16,borderTop:'1px solid #111',paddingTop:6,display:'flex',justifyContent:'space-between',fontSize:9,color:'#475467'}}>
        <span style={{flex:1}}>{company?.footerText || 'COMPANY CONFIDENTIAL | For project coordination only. Schedule is a living document and may change due to permitting, inspections, owner decisions, material availability, weather, or field conditions.'}</span>
        <span style={{marginLeft:16,whiteSpace:'nowrap'}}>Revision: {revision.revisionName}</span>
      </div>
    </div>
  )
}

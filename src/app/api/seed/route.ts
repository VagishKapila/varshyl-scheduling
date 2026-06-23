import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    // Idempotency check
    const existing = await prisma.template.findFirst({
      where: { id: 'commercial-ti-default' },
      include: { tasks: true },
    })
    if (existing && existing.tasks.length > 0) {
      return NextResponse.json({
        message: 'Already seeded',
        templateCount: 1,
        taskCount: existing.tasks.length,
      })
    }

    // Upsert template
    const template = await prisma.template.upsert({
      where: { id: 'commercial-ti-default' },
      update: {},
      create: {
        id: 'commercial-ti-default',
        name: 'Commercial TI',
        projectType: 'commercial-ti',
        isPublic: true,
      },
    })

    const taskDefs = [
      { sortOrder:1,  name:'Pricing / bid tours / authorization',             dur:3,  rel:'FS',  predIdx:null as number|null, lag:0, color:'blue', permit:false, milestone:false },
      { sortOrder:2,  name:'Contracts / NTP / subcontractor notification',    dur:2,  rel:'FS',  predIdx:0,    lag:0, color:'blue',   permit:false, milestone:false },
      { sortOrder:3,  name:'Permit / city review / plan check comments',      dur:15, rel:'FS',  predIdx:1,    lag:0, color:'red',    permit:true,  milestone:false },
      { sortOrder:4,  name:'Temporary protection / dust control / site prep', dur:3,  rel:'FS',  predIdx:1,    lag:0, color:'blue',   permit:false, milestone:false },
      { sortOrder:5,  name:'Demo / selective demolition',                     dur:5,  rel:'FS',  predIdx:3,    lag:0, color:'blue',   permit:false, milestone:false },
      { sortOrder:6,  name:'Concrete sawcutting / trenching / patch back',    dur:3,  rel:'FS',  predIdx:4,    lag:0, color:'blue',   permit:false, milestone:false },
      { sortOrder:7,  name:'Layout / framing / soffit / backing',             dur:8,  rel:'FS',  predIdx:5,    lag:0, color:'blue',   permit:false, milestone:false },
      { sortOrder:8,  name:'Electrical rough / overhead',                     dur:6,  rel:'SS',  predIdx:6,    lag:2, color:'blue',   permit:false, milestone:false },
      { sortOrder:9,  name:'Plumbing rough',                                  dur:4,  rel:'SS',  predIdx:6,    lag:3, color:'blue',   permit:false, milestone:false },
      { sortOrder:10, name:'HVAC rough / ceiling',                            dur:5,  rel:'SS',  predIdx:6,    lag:4, color:'blue',   permit:false, milestone:false },
      { sortOrder:11, name:'Fire protection / life safety',                   dur:4,  rel:'SS',  predIdx:7,    lag:0, color:'blue',   permit:false, milestone:false },
      { sortOrder:12, name:'Drywall / nailing / taping / texture',            dur:8,  rel:'FS',  predIdx:7,    lag:0, color:'blue',   permit:false, milestone:false },
      { sortOrder:13, name:'Ceiling work',                                    dur:5,  rel:'SS',  predIdx:11,   lag:2, color:'blue',   permit:false, milestone:false },
      { sortOrder:14, name:'Flooring',                                        dur:6,  rel:'FS',  predIdx:11,   lag:0, color:'blue',   permit:false, milestone:false },
      { sortOrder:15, name:'Paint',                                           dur:5,  rel:'FS',  predIdx:11,   lag:3, color:'blue',   permit:false, milestone:false },
      { sortOrder:16, name:'Millwork',                                        dur:4,  rel:'FS',  predIdx:14,   lag:0, color:'blue',   permit:false, milestone:false },
      { sortOrder:17, name:'Doors / frames / hardware',                       dur:3,  rel:'SS',  predIdx:15,   lag:0, color:'blue',   permit:false, milestone:false },
      { sortOrder:18, name:'Final inspections / punch / turnover',            dur:5,  rel:'FS',  predIdx:15,   lag:0, color:'red',    permit:true,  milestone:true  },
    ]

    // Clear and recreate tasks
    await prisma.templateTask.deleteMany({ where: { templateId: template.id } })
    const created: { id: string }[] = []
    for (const t of taskDefs) {
      const predId = t.predIdx !== null ? (created[t.predIdx]?.id ?? null) : null
      const task = await prisma.templateTask.create({
        data: {
          templateId: template.id,
          sortOrder: t.sortOrder,
          level: 1,
          name: t.name,
          defaultDurationDays: t.dur,
          relationshipType: t.rel,
          predecessorTemplateTaskId: predId,
          lagDays: t.lag,
          color: t.color,
          isPermitRelated: t.permit,
          isDefaultChecked: true,
        },
      })
      created.push(task)
    }

    return NextResponse.json({
      message: 'Seeded successfully',
      templateCount: 1,
      taskCount: created.length,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET for easy idempotency check
export async function GET() {
  const template = await prisma.template.findFirst({
    where: { id: 'commercial-ti-default' },
    include: { _count: { select: { tasks: true } } },
  })
  return NextResponse.json({
    seeded: !!template,
    templateName: template?.name ?? null,
    taskCount: template?._count?.tasks ?? 0,
  })
}

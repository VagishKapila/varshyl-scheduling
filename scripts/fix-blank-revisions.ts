/**
 * One-time repair: set isCurrent on the revision with the most tasks
 * when the current revision has zero tasks.
 *
 * Run: DATABASE_URL=... npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/fix-blank-revisions.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter } as any)

  const projects = await prisma.project.findMany()

  for (const project of projects) {
    const revisions = await prisma.scheduleRevision.findMany({
      where: { projectId: project.id },
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: 'desc' },
    })

    if (revisions.length === 0) continue

    const currentRevision = revisions.find(r => r.isCurrent)
    const currentTaskCount = currentRevision?._count.tasks ?? 0

    if (currentTaskCount === 0) {
      const bestRevision = revisions
        .filter(r => r._count.tasks > 0)
        .sort((a, b) => b._count.tasks - a._count.tasks)[0]

      if (bestRevision) {
        console.log(
          `Project ${project.name}: fixing current revision → ${bestRevision.revisionName} (${bestRevision._count.tasks} tasks)`,
        )

        await prisma.scheduleRevision.updateMany({
          where: { projectId: project.id },
          data: { isCurrent: false },
        })

        await prisma.scheduleRevision.update({
          where: { id: bestRevision.id },
          data: { isCurrent: true },
        })
      }
    }
  }

  console.log('Done')
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

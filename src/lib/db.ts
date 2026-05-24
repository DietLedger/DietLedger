import { PrismaClient } from '@prisma/client'
import path from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

function getDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  if (process.env.DOCKER) return 'file:/app/db/custom.db'
  const dbDir = path.join(homedir(), '.recipetool')
  mkdirSync(dbDir, { recursive: true })
  return `file:${path.join(dbDir, 'dev.db')}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: getDbUrl(),
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

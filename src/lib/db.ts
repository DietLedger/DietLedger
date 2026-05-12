import { PrismaClient } from '@prisma/client'
import path from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

const dbDir = path.join(homedir(), '.recipetool')
mkdirSync(dbDir, { recursive: true })
const dbPath = path.join(dbDir, 'dev.db')

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: `file:${dbPath}`,
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient instance. Every package that queries the database imports this
 * rather than constructing its own client — avoids exhausting Postgres connections during
 * development hot-reload (the standard Next.js-safe singleton pattern), and matches the
 * design spec's "single source of truth" discipline already used for the calculation
 * engine's runEngine(). Requires an explicit driver adapter (Prisma 7) rather than reading
 * DATABASE_URL implicitly.
 */
declare global {
  var __dossipvPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalThis.__dossipvPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__dossipvPrisma = db;
}

export * from '@prisma/client';

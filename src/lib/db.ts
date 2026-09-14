import 'server-only';
import { PrismaClient, Prisma } from '@prisma/client';
import type { Database } from '../modules/auth/database';

const globalDb = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalDb.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDb.prisma = prisma;

export function prismaDatabase(client: PrismaClient | Prisma.TransactionClient): Database {
  return {
    // SQL text is authored in the service; every external value is a bound parameter.
    query: <T>(sql: string, params: unknown[] = []) => client.$queryRawUnsafe<T[]>(sql, ...params),
    transaction: <T>(fn: (tx: Database) => Promise<T>, options?: {isolationLevel:'Serializable'}) => {
      if (!('$transaction' in client)) return fn(prismaDatabase(client));
      return client.$transaction(tx => fn(prismaDatabase(tx)), { timeout: 15000, ...options });
    },
  };
}
export const db = prismaDatabase(prisma);

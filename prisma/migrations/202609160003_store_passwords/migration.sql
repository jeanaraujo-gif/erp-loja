-- AlterTable
ALTER TABLE "store_accounts" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

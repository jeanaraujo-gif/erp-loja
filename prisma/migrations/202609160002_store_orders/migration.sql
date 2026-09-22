-- CreateEnum
CREATE TYPE "StoreOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "store_orders" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "status" "StoreOrderStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" UUID NOT NULL,

    CONSTRAINT "store_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_orders_number_key" ON "store_orders"("number");

-- CreateIndex
CREATE INDEX "store_orders_customerId_idx" ON "store_orders"("customerId");

-- CreateIndex
CREATE INDEX "store_orders_createdAt_idx" ON "store_orders"("createdAt");

-- AddForeignKey
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

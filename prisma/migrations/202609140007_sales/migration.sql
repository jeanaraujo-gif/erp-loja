ALTER TABLE sales ADD COLUMN "warehouseId" uuid REFERENCES warehouses(id) ON DELETE RESTRICT,
 ADD COLUMN "requestHash" text, ADD COLUMN "finalizeKey" text UNIQUE, ADD COLUMN "finalizeHash" text,
 ADD COLUMN "cancelKey" text UNIQUE, ADD COLUMN "cancelHash" text, ADD COLUMN "cancelReason" text,
 ADD COLUMN "cancelledAt" timestamptz(3), ADD COLUMN "discountReason" text;
ALTER TABLE sale_items ADD COLUMN "productCode" text, ADD COLUMN unit text;
ALTER TABLE cash_sessions ADD COLUMN "operationKey" text UNIQUE, ADD COLUMN "requestHash" text,
 ADD COLUMN "closeKey" text UNIQUE, ADD COLUMN "closeHash" text;
INSERT INTO cash_registers(id,name) VALUES ('00000000-0000-4000-8000-000000000001','Caixa principal') ON CONFLICT DO NOTHING;
CREATE INDEX sales_open_order ON sales(status,"createdAt" DESC,id);
-- All ledger writers touch the product row, including Read Committed manual stock writes.
-- A Serializable sale with an older snapshot must retry instead of validating stale stock.
CREATE OR REPLACE FUNCTION validate_stock_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance numeric(18,3);
BEGIN
 UPDATE products SET version=version WHERE id=NEW."productId";
 SELECT coalesce(sum(quantity),0) INTO balance FROM stock_movements
 WHERE "productId"=NEW."productId" AND "warehouseId"=NEW."warehouseId";
 IF NEW."before"<>balance THEN RAISE EXCEPTION 'Saldo de estoque desatualizado'; END IF;
 RETURN NEW;
END $$;
-- Every new cash movement must belong to an open session and match its payment.
CREATE FUNCTION validate_cash_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_row cash_sessions%ROWTYPE; payment_row payments%ROWTYPE;
BEGIN
 SELECT * INTO session_row FROM cash_sessions WHERE id=NEW."sessionId" FOR UPDATE;
 IF NOT FOUND OR session_row."closedAt" IS NOT NULL THEN RAISE EXCEPTION 'Caixa fechado'; END IF;
 IF NEW."paymentId" IS NOT NULL THEN
  SELECT * INTO payment_row FROM payments WHERE id=NEW."paymentId";
  IF NOT FOUND OR payment_row.amount<>NEW.amount OR payment_row.direction<>NEW.direction OR payment_row.method<>NEW.method THEN RAISE EXCEPTION 'Pagamento e caixa divergentes'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cash_entry BEFORE INSERT ON cash_movements FOR EACH ROW EXECUTE FUNCTION validate_cash_entry();

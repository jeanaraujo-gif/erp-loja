-- Ledger rows are immutable. Corrections create compensating entries.
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Registro imutavel: use estorno ou ajuste compensatorio'; END;
$$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['stock_movements','payments','cash_movements','audit_logs','receivable_allocations','payable_allocations','receivable_adjustments','sale_returns','return_items','credit_overrides'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_ledger BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation()', t);
  END LOOP;
END $$;
ALTER TABLE products ADD CHECK (cost >= 0 AND price >= 0 AND minimum >= 0 AND (maximum IS NULL OR maximum >= minimum));
ALTER TABLE customers ADD CHECK ("creditLimit" >= 0);
ALTER TABLE sales ADD CHECK (subtotal >= 0 AND discount >= 0 AND discount <= subtotal AND total = subtotal - discount);
ALTER TABLE sale_items ADD CHECK (quantity > 0 AND "unitPrice" >= 0 AND "unitCost" >= 0 AND discount >= 0 AND total >= 0 AND total = round(quantity * "unitPrice", 2) - discount);
ALTER TABLE accounts_receivable ADD CHECK (amount > 0 AND installment > 0);
ALTER TABLE accounts_payable ADD CHECK (amount > 0);
ALTER TABLE payments ADD CHECK (amount > 0 AND ("reversesId" IS NULL OR "reversesId" <> id));
ALTER TABLE cash_movements ADD CHECK (amount > 0 AND ("reversesId" IS NULL OR "reversesId" <> id));
ALTER TABLE receivable_allocations ADD CHECK (amount > 0);
ALTER TABLE payable_allocations ADD CHECK (amount > 0);
ALTER TABLE receivable_adjustments ADD CHECK (amount <> 0);
ALTER TABLE return_items ADD CHECK (quantity > 0 AND amount >= 0);
ALTER TABLE stock_movements ADD CHECK (quantity <> 0 AND "before" >= 0 AND "after" >= 0 AND "after" = "before" + quantity);
ALTER TABLE stock_movements ADD CHECK (
 (kind IN ('ENTRY','RETURN') AND quantity > 0) OR
 (kind IN ('SALE','LOSS','DAMAGE') AND quantity < 0) OR
 kind IN ('ADJUSTMENT','TRANSFER'));
ALTER TABLE cash_sessions ADD CHECK ("openingBalance" >= 0 AND
 (("closedAt" IS NULL AND "closedById" IS NULL AND "countedBalance" IS NULL AND "expectedBalance" IS NULL) OR
 ("closedAt" IS NOT NULL AND "closedAt" >= "openedAt" AND "closedById" IS NOT NULL AND "countedBalance" IS NOT NULL AND "expectedBalance" IS NOT NULL)));
CREATE UNIQUE INDEX one_open_session_per_register ON cash_sessions ("registerId") WHERE "closedAt" IS NULL;
CREATE INDEX receivable_due ON accounts_receivable ("dueDate");
CREATE INDEX payable_due ON accounts_payable ("dueDate");
CREATE INDEX stock_product_warehouse ON stock_movements ("productId", "warehouseId");

-- Lock the product to serialize stock writes; balances come exclusively from the ledger.
CREATE FUNCTION validate_stock_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance numeric(18,3);
BEGIN
 PERFORM id FROM products WHERE id = NEW."productId" FOR UPDATE;
 SELECT coalesce(sum(quantity),0) INTO balance FROM stock_movements
 WHERE "productId" = NEW."productId" AND "warehouseId" = NEW."warehouseId";
 IF NEW."before" <> balance THEN RAISE EXCEPTION 'Saldo de estoque desatualizado'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_balance BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION validate_stock_balance();

CREATE VIEW stock_balances AS
SELECT "productId", "warehouseId", sum(quantity) AS quantity FROM stock_movements GROUP BY "productId", "warehouseId";

CREATE VIEW receivable_balances AS
SELECT r.id, r."customerId", r."saleId", r."dueDate", r.amount,
 r.amount + coalesce((SELECT sum(a.amount) FROM receivable_adjustments a WHERE a."receivableId"=r.id),0)
 - coalesce((SELECT sum(CASE WHEN p.direction='IN' THEN a.amount ELSE -a.amount END)
 FROM receivable_allocations a JOIN payments p ON p.id=a."paymentId" WHERE a."receivableId"=r.id),0) AS outstanding
FROM accounts_receivable r;
CREATE VIEW customer_credit AS
SELECT c.id AS "customerId", c."creditLimit", coalesce(sum(r.outstanding),0) AS used,
 c."creditLimit"-coalesce(sum(r.outstanding),0) AS available
FROM customers c LEFT JOIN receivable_balances r ON r."customerId"=c.id GROUP BY c.id;

INSERT INTO roles(id,code,name) VALUES
 ('00000000-0000-4000-8000-000000000001','ADMIN','Administrador'),
 ('00000000-0000-4000-8000-000000000002','MANAGER','Gerente'),
 ('00000000-0000-4000-8000-000000000003','SELLER','Vendedor'),
 ('00000000-0000-4000-8000-000000000004','CASHIER','Caixa');
INSERT INTO warehouses(id,name) VALUES ('00000000-0000-4000-8000-000000000001','Estoque principal');


ALTER TABLE stock_movements
 ADD COLUMN sequence bigserial UNIQUE,
 ADD COLUMN "requestHash" text,
 ADD COLUMN "productName" text,
 ADD COLUMN "productCode" text,
 ADD COLUMN unit text,
 ADD COLUMN "reversesId" uuid UNIQUE REFERENCES stock_movements(id) ON DELETE RESTRICT,
 ADD CHECK ("reversesId" IS NULL OR ("reversesId" <> id AND kind='ADJUSTMENT'));
CREATE INDEX stock_history_order ON stock_movements ("warehouseId","productId","createdAt" DESC,id);
-- New rows keep a product snapshot. Existing immutable rows retain their original fields.
CREATE FUNCTION validate_stock_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original stock_movements%ROWTYPE;
BEGIN
 IF NEW."reversesId" IS NOT NULL THEN
  SELECT * INTO original FROM stock_movements WHERE id=NEW."reversesId";
  IF NOT FOUND OR original."productId"<>NEW."productId" OR original."warehouseId"<>NEW."warehouseId"
   OR original.quantity<>-NEW.quantity OR original."reversesId" IS NOT NULL
   OR original.kind NOT IN ('ENTRY','RETURN','ADJUSTMENT','LOSS','DAMAGE')
   OR original."saleItemId" IS NOT NULL OR original."returnItemId" IS NOT NULL THEN
   RAISE EXCEPTION 'Estorno de estoque invalido';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stock_reversal BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION validate_stock_reversal();

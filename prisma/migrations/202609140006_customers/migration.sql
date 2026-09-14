ALTER TABLE customers ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE customers ADD COLUMN "updatedAt" timestamptz(3) NOT NULL DEFAULT now();
UPDATE customers SET "updatedAt"="createdAt";
CREATE INDEX customers_name_active ON customers(active,lower(name));

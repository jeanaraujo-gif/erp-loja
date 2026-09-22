ALTER TABLE store_orders
 ADD COLUMN "saleId" uuid UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
 ADD COLUMN "invoicedAt" timestamptz(3),
 ADD COLUMN "cancelReason" text,
 ADD COLUMN "operationKey" uuid,
 ADD COLUMN "requestHash" text;
CREATE UNIQUE INDEX store_orders_checkout_key ON store_orders("customerId","operationKey");
CREATE INDEX store_orders_queue ON store_orders(status,"createdAt" DESC,id);
INSERT INTO permissions(id,code,description) VALUES
 (md5('erp.permission.orders.invoice')::uuid,'orders.invoice','Conferir e faturar pedidos do site');
INSERT INTO role_permissions(id,"roleId","permissionId")
 SELECT md5(r.code || ':orders.invoice')::uuid,r.id,p.id
 FROM roles r CROSS JOIN permissions p
 WHERE r.code IN ('ADMIN','MANAGER','SELLER') AND p.code='orders.invoice';

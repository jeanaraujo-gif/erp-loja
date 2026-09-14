ALTER TABLE users ADD COLUMN "mustChangePassword" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX users_email_normalized ON users (lower(email));
ALTER TABLE users ADD CHECK (email = lower(trim(email)));
CREATE INDEX sessions_expiration ON sessions ("expiresAt");
ALTER TABLE sessions ADD CHECK ("expiresAt" > "createdAt");
CREATE TABLE login_throttles (
 key text PRIMARY KEY,
 attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
 "windowStart" timestamptz(3) NOT NULL DEFAULT now()
);
INSERT INTO permissions(id,code,description)
SELECT md5('erp.permission.' || code)::uuid, code, description FROM (VALUES
 ('users.manage','Gerenciar usuários'),
 ('products.read','Consultar produtos'), ('products.manage','Gerenciar produtos'),
 ('customers.read','Consultar clientes'), ('customers.manage','Gerenciar clientes'),
 ('sales.create','Registrar vendas'), ('sales.finalize','Finalizar vendas'),
 ('credit.override','Aprovar crédito excedido'),
 ('stock.manage','Gerenciar estoque'), ('finance.manage','Gerenciar financeiro'),
 ('cash.manage','Operar caixa'), ('receipts.create','Receber pagamentos'),
 ('reports.read','Consultar relatórios'), ('audit.read','Consultar auditoria')
) AS p(code, description);
INSERT INTO role_permissions(id,"roleId","permissionId")
SELECT md5(r.code || ':' || p.code)::uuid,r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='ADMIN'
 OR (r.code='MANAGER' AND p.code <> 'users.manage')
 OR (r.code='SELLER' AND p.code IN ('products.read','customers.read','sales.create'))
 OR (r.code='CASHIER' AND p.code IN ('receipts.create','cash.manage','sales.finalize'));

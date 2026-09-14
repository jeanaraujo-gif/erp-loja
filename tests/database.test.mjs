import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('migrações, estoque, integridade e crédito', async () => {
 const db = new PGlite();
 try {
 for (const name of ['202609140001_initial','202609140002_integrity'])
  await db.exec(await readFile(new URL(`../prisma/migrations/${name}/migration.sql`,import.meta.url),'utf8'));
 const u='10000000-0000-4000-8000-000000000001', p='20000000-0000-4000-8000-000000000001', w='00000000-0000-4000-8000-000000000001';
 await db.query(`INSERT INTO users(id,name,email,"passwordHash","roleId") VALUES ($1,'Teste','test@example.invalid','not-a-real-hash',$2)`,[u,w]);
 await db.query(`INSERT INTO products(id,code,name,cost,price) VALUES ($1,'P1','Produto',10.10,20.20)`,[p]);
 async function stock(id,quantity,before,after,kind='ENTRY') {
  return db.query(`INSERT INTO stock_movements(id,kind,quantity,"before","after",notes,"operationKey","productId","warehouseId","actorId") VALUES ($1::uuid,$2,$3,$4,$5,'Teste',$1::uuid::text,$6,$7,$8)`,[id,kind,quantity,before,after,p,w,u]);
 }
 const s1='30000000-0000-4000-8000-000000000001';
 await stock(s1,10,0,10);
 await assert.rejects(stock('30000000-0000-4000-8000-000000000002',1,0,1),/desatualizado/);
 await assert.rejects(stock('30000000-0000-4000-8000-000000000003',-11,10,-1,'SALE'));
 await assert.rejects(db.query('DELETE FROM stock_movements WHERE id=$1',[s1]),/imutavel/);
 await stock('30000000-0000-4000-8000-000000000004',-2,10,8,'SALE');
 assert.equal((await db.query('SELECT quantity FROM stock_balances')).rows[0].quantity,'8.000');
 await assert.rejects(stock(s1,1,8,9));
 const c='40000000-0000-4000-8000-000000000001',sale='50000000-0000-4000-8000-000000000001',r='60000000-0000-4000-8000-000000000001',pay='70000000-0000-4000-8000-000000000001';
 await db.query(`INSERT INTO customers(id,name,"creditLimit") VALUES ($1,'Cliente',1000)`,[c]);
 await db.query(`INSERT INTO sales(id,subtotal,total,"operationKey","sellerId","customerId") VALUES ($1,350,350,'venda1',$2,$3)`,[sale,u,c]);
 await db.query(`INSERT INTO accounts_receivable(id,installment,amount,"dueDate","saleId","customerId") VALUES ($1,1,350,'2026-10-01',$2,$3)`,[r,sale,c]);
 assert.equal((await db.query('SELECT available FROM customer_credit')).rows[0].available,'650.00');
 await db.query(`INSERT INTO payments(id,direction,method,amount,"operationKey","actorId") VALUES ($1,'IN','PIX',100,'p1',$2)`,[pay,u]);
 await db.query(`INSERT INTO receivable_allocations(id,amount,"receivableId","paymentId") VALUES ('80000000-0000-4000-8000-000000000001',100,$1,$2)`,[r,pay]);
 assert.equal((await db.query('SELECT available FROM customer_credit')).rows[0].available,'750.00');
 await assert.rejects(db.query('UPDATE payments SET amount=50 WHERE id=$1',[pay]),/imutavel/);
 await assert.rejects(db.query('DELETE FROM users WHERE id=$1',[u]));
 const register='90000000-0000-4000-8000-000000000001';
 await db.query(`INSERT INTO cash_registers(id,name) VALUES ($1,'Balcão')`,[register]);
 await db.query(`INSERT INTO cash_sessions(id,"registerId","openedById","openingBalance") VALUES ('91000000-0000-4000-8000-000000000001',$1,$2,100)`,[register,u]);
 await assert.rejects(db.query(`INSERT INTO cash_sessions(id,"registerId","openedById","openingBalance") VALUES ('91000000-0000-4000-8000-000000000002',$1,$2,100)`,[register,u]));
 await assert.rejects(db.query(`UPDATE cash_sessions SET "countedBalance"=100`));
 } finally { await db.close(); }
});



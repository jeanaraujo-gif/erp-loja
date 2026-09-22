import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../auth/database';
import { authService } from '../auth/service';
import { AuthError } from '../auth/security';
import { salesService } from '../sales/service';
import { finalizeSchema, moneySchema, cents, fixed } from '../sales/validation';

const itemSchema = z.object({ id:z.number().int().positive(), name:z.string().min(1).max(200), price:z.number().positive().finite(), quantity:z.number().int().min(1).max(99) });
const invoiceSchema = z.object({
  warehouseId:z.uuid(), expectedTotal:moneySchema,
  mappings:z.array(z.object({index:z.number().int().min(0),productId:z.uuid(),expectedPrice:moneySchema}).strict()).min(1).max(50),
  payment:finalizeSchema,
}).strict();
export type Order = {id:string;number:number;status:string;items:z.infer<typeof itemSchema>[];total:string;notes:string|null;createdAt:string;customerId:string;customerName:string;phone:string|null;email:string|null;saleId:string|null;saleNumber:number|null;saleStatus:string|null;invoicedAt:string|null;cancelReason:string|null};
const columns = `o.id,o.number,o.status,o.items,o.total::text,o.notes,o."createdAt"::text,o."customerId",c.name AS "customerName",c.phone,c.email,o."saleId",s.number AS "saleNumber",s.status AS "saleStatus",o."invoicedAt"::text,o."cancelReason"`;
const joins = `FROM store_orders o JOIN customers c ON c.id=o."customerId" LEFT JOIN sales s ON s.id=o."saleId"`;

export function ordersService(db:Database) {
  const permit=(tx:Database,token?:string)=>authService(tx).principal(token,'orders.invoice');
  async function atomic<T>(fn:(tx:Database)=>Promise<T>):Promise<T> {
    for(let attempt=0;;attempt++) {
      try {return await db.transaction(fn,{isolationLevel:'Serializable'});} catch(error) {
        const e=error as {code?:string;meta?:{code?:string}};
        if(['40001','40P01','P2034','23505','P2002'].includes(e.meta?.code??e.code??'')) {
          if(attempt<2) continue;
          throw new AuthError(409,'Outro vendedor está atualizando este pedido. Atualize a lista.');
        }
        throw error;
      }
    }
  }
  async function read(tx:Database,id:string) {
    const [order]=await tx.query<Order>(`SELECT ${columns} ${joins} WHERE o.id=$1::uuid`,[id]);
    if(!order) throw new AuthError(404,'Pedido não encontrado.');
    return order;
  }
  return {
    async list(token:string|undefined,input:unknown) {
      await permit(db,token);
      const f=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),status:z.enum(['ALL','PENDING','CONFIRMED','CANCELLED']).default('PENDING')}).parse(input);
      const where=`($1='ALL' OR o.status::text=$1)`;
      const orders=await db.query<Order>(`SELECT ${columns} ${joins} WHERE ${where} ORDER BY o."createdAt" DESC,o.id DESC LIMIT 25 OFFSET $2::int`,[f.status,(f.page-1)*25]);
      const [{total}]=await db.query<{total:number}>(`SELECT count(*)::int total FROM store_orders o WHERE ${where}`,[f.status]);
      return {orders,total,page:f.page};
    },
    async get(token:string|undefined,id:string) {await permit(db,token);z.uuid().parse(id);return read(db,id);},
    async options(token?:string) {
      await permit(db,token);
      return {warehouses:await db.query<{id:string;name:string}>('SELECT id,name FROM warehouses WHERE active ORDER BY name'),
        sessions:await db.query<{id:string;name:string;openedBy:string}>(`SELECT s.id,r.name,u.name AS "openedBy" FROM cash_sessions s JOIN cash_registers r ON r.id=s."registerId" JOIN users u ON u.id=s."openedById" WHERE s."closedAt" IS NULL AND r.active ORDER BY s."openedAt"`)};
    },
    async invoice(token:string|undefined,id:string,input:unknown) {
      await permit(db,token);z.uuid().parse(id);const data=invoiceSchema.parse(input);
      return atomic(async tx=>{
        const actor=await permit(tx,token);
        await tx.query('SELECT id FROM store_orders WHERE id=$1::uuid FOR UPDATE',[id]);
        const order=await read(tx,id);
        if(order.saleId) return {saleId:order.saleId,replayed:true};
        if(order.status!=='PENDING') throw new AuthError(409,'Este pedido não está pendente.');
        const parsed=z.array(itemSchema).min(1).max(50).safeParse(order.items);
        if(!parsed.success) throw new AuthError(409,'Os itens deste pedido precisam ser corrigidos antes do faturamento.');
        if(data.mappings.length!==parsed.data.length || new Set(data.mappings.map(m=>m.index)).size!==parsed.data.length || data.mappings.some(m=>m.index>=parsed.data.length)) throw new AuthError(400,'Associe todos os itens ao estoque.');
        if(new Set(data.mappings.map(m=>m.productId)).size!==data.mappings.length) throw new AuthError(400,'Cada item deve corresponder a um produto diferente do ERP.');
        if(data.mappings.some(m=>cents(m.expectedPrice)!==BigInt(Math.round(parsed.data[m.index].price*100)))) throw new AuthError(409,'O preço de um item difere do site. Confira o cadastro antes de faturar.');
        // Services join this transaction: a failed payment/stock check rolls back the entire invoice.
        const bound:Database={query:(sql,params)=>tx.query(sql,params),transaction:fn=>fn(bound)};
        const sales=salesService(bound);
        const sale=await sales.create(token,{operationKey:id,warehouseId:data.warehouseId,customerId:order.customerId,discount:'0',items:data.mappings.map(m=>({productId:m.productId,quantity:String(parsed.data[m.index].quantity),expectedPrice:m.expectedPrice}))});
        const [created]=await tx.query<{total:string}>('SELECT total::text FROM sales WHERE id=$1::uuid',[sale.id]);
        if(created.total!==data.expectedTotal) throw new AuthError(409,'O total mudou. Confira os produtos e pagamentos novamente.');
        // Never silently charge a different amount than the customer ordered.
        if(cents(created.total)!==cents(order.total)) throw new AuthError(409,'O total dos produtos do ERP difere do pedido. Ajuste o cadastro de preços antes de faturar.');
        const requested=parsed.data.reduce((sum,l)=>sum+BigInt(Math.round(l.price*100))*BigInt(l.quantity),0n);
        if(fixed(requested)!==order.total) throw new AuthError(409,'O pedido possui valores inconsistentes e não pode ser faturado.');
        await tx.query('UPDATE store_orders SET "saleId"=$2::uuid WHERE id=$1::uuid RETURNING id',[id,sale.id]);
        await sales.finalize(token,sale.id,data.payment,id);
        await tx.query(`UPDATE store_orders SET status='CONFIRMED',"invoicedAt"=now() WHERE id=$1::uuid RETURNING id`,[id]);
        await tx.query(`INSERT INTO audit_logs(id,"actorId",operation,entity,"entityId","requestId","after") VALUES ($1::uuid,$2::uuid,'ORDER_INVOICED','store_orders',$3,$4,$5::jsonb) RETURNING id`,[randomUUID(),actor.id,id,data.payment.operationKey,JSON.stringify({saleId:sale.id,total:created.total})]);
        return {saleId:sale.id,replayed:false};
      });
    },
    async cancel(token:string|undefined,id:string,input:unknown) {
      await permit(db,token);z.uuid().parse(id);const {reason}=z.object({reason:z.string().trim().min(5).max(500)}).strict().parse(input);
      return atomic(async tx=>{
        const actor=await permit(tx,token);
        await tx.query('SELECT id FROM store_orders WHERE id=$1::uuid FOR UPDATE',[id]);
        const order=await read(tx,id);
        if(order.status!=='PENDING'||order.saleId) throw new AuthError(409,'Somente pedidos pendentes podem ser cancelados aqui.');
        await tx.query(`UPDATE store_orders SET status='CANCELLED',"cancelReason"=$2 WHERE id=$1::uuid RETURNING id`,[id,reason]);
        await tx.query(`INSERT INTO audit_logs(id,"actorId",operation,entity,"entityId","requestId",reason) VALUES ($1::uuid,$2::uuid,'ORDER_CANCELLED','store_orders',$3,$4,$5) RETURNING id`,[randomUUID(),actor.id,id,randomUUID(),reason]);
        return {id};
      });
    },
  };
}

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../auth/database';
import { authService } from '../auth/service';
import { AuthError } from '../auth/security';
import { categorySchema,updateCategorySchema,createProductSchema,updateProductSchema,filterSchema } from './validation';
import { profit } from './decimal';

export type Category={id:string;name:string;active:boolean;version:number;productCount:number};
export type CatalogProduct={id:string;name:string;code:string;barcode:string|null;sku:string|null;description:string|null;brand:string|null;unit:string;price:string;cost?:string;grossProfit?:string;margin?:string|null;minimum:string;maximum:string|null;location:string|null;photoUrl:string|null;active:boolean;version:number;categoryId:string|null;categoryName:string|null;stock:string;supplierIds:string[]};
const productColumns=`p.id,p.name,p.code,p.barcode,p.sku,p.description,p.brand,p.unit,p.cost::text,p.price::text,p.minimum::text,p.maximum::text,p.location,p."photoUrl",p.active,p.version,p."categoryId",c.name AS "categoryName",coalesce((SELECT sum(s.quantity) FROM stock_movements s WHERE s."productId"=p.id),0)::numeric(18,3)::text AS stock`;
function sqlState(error:unknown):string|undefined {
 if(!error||typeof error!=='object')return;
 const e=error as {code?:string;meta?:{code?:string}};return e.meta?.code??e.code;
}
async function write<T>(fn:()=>Promise<T>) {
 try{return await fn();}catch(error){if(sqlState(error)==='23505'||sqlState(error)==='P2002')throw new AuthError(409,'Já existe um cadastro com esse código, SKU, código de barras ou nome de categoria.');throw error;}
}
export function catalogService(db:Database) {
 const actor=(tx:Database,token?:string,manage=false)=>authService(tx).principal(token,manage?'products.manage':'products.read');
 async function audit(tx:Database,userId:string,operation:string,entity:string,id:string,before:unknown,after:unknown) {
  await tx.query(`INSERT INTO audit_logs(id,"actorId",operation,entity,"entityId","requestId","before","after") VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING id`,[randomUUID(),userId,operation,entity,id,randomUUID(),JSON.stringify(before),JSON.stringify(after)]);
 }
 async function readProduct(tx:Database,id:string):Promise<CatalogProduct> {
  const [product]=await tx.query<CatalogProduct>(`SELECT ${productColumns} FROM products p LEFT JOIN categories c ON c.id=p."categoryId" WHERE p.id=$1::uuid`,[id]);
  if(!product)throw new AuthError(404,'Produto não encontrado.');
  const suppliers=await tx.query<{supplierId:string}>(`SELECT "supplierId" FROM product_suppliers WHERE "productId"=$1::uuid ORDER BY "supplierId"`,[id]);
  return {...product,...profit(product.cost!,product.price),supplierIds:suppliers.map(s=>s.supplierId)};
 }
 function publicProduct(product:CatalogProduct,manage:boolean) {
  if(manage)return product;
  const {cost,grossProfit,margin,...visible}=product;void cost;void grossProfit;void margin;return visible;
 }
 async function references(tx:Database,data:{categoryId:string|null;supplierIds:string[]},previous?:CatalogProduct) {
  if(data.categoryId){
   const [category]=await tx.query<{active:boolean}>(`SELECT active FROM categories WHERE id=$1::uuid FOR SHARE`,[data.categoryId]);
   if(!category||(!category.active&&data.categoryId!==previous?.categoryId))throw new AuthError(400,'Selecione uma categoria ativa.');
  }
  for(const id of [...data.supplierIds].sort()){
   const [supplier]=await tx.query<{active:boolean}>(`SELECT active FROM suppliers WHERE id=$1::uuid FOR SHARE`,[id]);
   if(!supplier||(!supplier.active&&!previous?.supplierIds.includes(id)))throw new AuthError(400,'Selecione fornecedores ativos.');
  }
 }
 return {
  async categories(token?:string){await actor(db,token);return db.query<Category>(`SELECT c.id,c.name,c.active,c.version,(SELECT count(*)::int FROM products p WHERE p."categoryId"=c.id) AS "productCount" FROM categories c ORDER BY lower(c.name),c.id`);},
  async saveCategory(token:string|undefined,input:unknown,id?:string){
   if(id)z.uuid().parse(id);
   const data=id?updateCategorySchema.parse(input):categorySchema.parse(input);
   return write(()=>db.transaction(async tx=>{
    const user=await actor(tx,token,true);let before=null;
    if(id){
     const [row]=await tx.query<Category>(`SELECT id,name,active,version FROM categories WHERE id=$1::uuid FOR UPDATE`,[id]);
     if(!row)throw new AuthError(404,'Categoria não encontrada.');
     if(!('version' in data)||row.version!==data.version)throw new AuthError(409,'Esta categoria foi alterada. Recarregue antes de salvar.');
     before=row;
     await tx.query(`UPDATE categories SET name=$2,active=$3,version=version+1,"updatedAt"=now() WHERE id=$1::uuid RETURNING id`,[id,data.name,data.active]);
    }else{id=randomUUID();await tx.query(`INSERT INTO categories(id,name,active) VALUES ($1::uuid,$2,$3) RETURNING id`,[id,data.name,data.active]);}
    await audit(tx,user.id,before?'CATEGORY_UPDATED':'CATEGORY_CREATED','categories',id,before,{name:data.name,active:data.active});return {id};
   }));
  },
  async suppliers(token?:string){await actor(db,token,true);return db.query<{id:string;name:string;active:boolean}>(`SELECT id,coalesce("tradeName","legalName") AS name,active FROM suppliers ORDER BY "legalName",id`);},
  async get(token:string|undefined,id:string){z.uuid().parse(id);const user=await actor(db,token);return publicProduct(await readProduct(db,id),user.permissions.includes('products.manage'));},
  async list(token:string|undefined,input:unknown){
   const user=await actor(db,token),filters=filterSchema.parse(input);
   // strpos implements literal substring search, so % and _ are not wildcard operators.
   const where=`($1='' OR strpos(lower(p.name),lower($1))>0 OR strpos(lower(p.code),lower($1))>0 OR strpos(lower(coalesce(p.sku,'')),lower($1))>0 OR strpos(lower(coalesce(p.barcode,'')),lower($1))>0) AND ($2='all' OR p.active=($2='active')) AND ($3='' OR p."categoryId"=nullif($3,'')::uuid)`;
   const params=[filters.q,filters.status,filters.categoryId];
   const rows=await db.query<CatalogProduct>(`SELECT ${productColumns} FROM products p LEFT JOIN categories c ON c.id=p."categoryId" WHERE ${where} ORDER BY lower(p.name),p.id LIMIT 25 OFFSET $4::int`,[...params,(filters.page-1)*25]);
   const [{total}]=await db.query<{total:number}>(`SELECT count(*)::int AS total FROM products p WHERE ${where}`,params);
   return {products:rows.map(p=>publicProduct({...p,...profit(p.cost!,p.price),supplierIds:[]},user.permissions.includes('products.manage'))),total,page:filters.page,pageSize:25};
  },
  async save(token:string|undefined,input:unknown,id?:string){
   if(id)z.uuid().parse(id);const data=id?updateProductSchema.parse(input):createProductSchema.parse(input);
   return write(()=>db.transaction(async tx=>{
    const user=await actor(tx,token,true);let before:CatalogProduct|undefined;
    if(id){
     await tx.query(`SELECT id FROM products WHERE id=$1::uuid FOR UPDATE`,[id]);before=await readProduct(tx,id);
     if(!('version' in data)||data.version!==before.version)throw new AuthError(409,'Este produto foi alterado. Reabra o cadastro antes de salvar.');
    }
    await references(tx,data,before);
    const values=[data.name,data.code,data.barcode,data.sku,data.description,data.brand,data.unit,data.cost,data.price,data.minimum,data.maximum,data.location,data.photoUrl,data.active,data.categoryId];
    if(id){
     await tx.query(`UPDATE products SET name=$2,code=$3,barcode=$4,sku=$5,description=$6,brand=$7,unit=$8,cost=$9::numeric,price=$10::numeric,minimum=$11::numeric,maximum=$12::numeric,location=$13,"photoUrl"=$14,active=$15,"categoryId"=$16::uuid,version=version+1,"updatedAt"=now() WHERE id=$1::uuid RETURNING id`,[id,...values]);
    }else{
     id=randomUUID();await tx.query(`INSERT INTO products(id,name,code,barcode,sku,description,brand,unit,cost,price,minimum,maximum,location,"photoUrl",active,"categoryId") VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10::numeric,$11::numeric,$12::numeric,$13,$14,$15,$16::uuid) RETURNING id`,[id,...values]);
    }
    // Association rows are catalog metadata, not stock or financial history.
    await tx.query(`DELETE FROM product_suppliers WHERE "productId"=$1::uuid RETURNING id`,[id]);
    for(const supplierId of data.supplierIds)await tx.query(`INSERT INTO product_suppliers(id,"productId","supplierId") VALUES ($1::uuid,$2::uuid,$3::uuid) RETURNING id`,[randomUUID(),id,supplierId]);
    const after=await readProduct(tx,id);
    await audit(tx,user.id,before?'PRODUCT_UPDATED':'PRODUCT_CREATED','products',id,before??null,after);
    if(before&&(before.price!==after.price||before.cost!==after.cost))await audit(tx,user.id,'PRODUCT_PRICE_CHANGED','products',id,{cost:before.cost,price:before.price},{cost:after.cost,price:after.price});
    return after;
   }));
  },
 };
}

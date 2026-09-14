import {z} from 'zod';
import {normalizeDecimal} from '../catalog/decimal';
import {quantitySchema} from '../stock/validation';
export const moneySchema=z.string().trim().regex(/^\d{1,16}(?:[.,]\d{1,2})?$/,'Informe um valor com até duas casas decimais.').transform(v=>normalizeDecimal(v,2));
export const cents=(v:string)=>BigInt(v.replace('.',''));
export function fixed(v:bigint){const sign=v<0n?'-':'';const s=(v<0n?-v:v).toString().padStart(3,'0');return sign+s.slice(0,-2)+'.'+s.slice(-2);}
export const saleSchema=z.object({operationKey:z.uuid(),warehouseId:z.uuid(),customerId:z.uuid().nullable().default(null),sellerId:z.uuid().optional(),discount:moneySchema.default('0.00'),discountReason:z.string().trim().max(500).default(''),items:z.array(z.object({productId:z.uuid(),quantity:quantitySchema,expectedPrice:moneySchema}).strict()).min(1).max(50)}).strict().refine(d=>new Set(d.items.map(i=>i.productId)).size===d.items.length,'Agrupe as quantidades de cada produto.').refine(d=>!/^\d+\.\d{2}$/.test(d.discount)||cents(d.discount)===0n||d.discountReason.length>=5,'Informe o motivo do desconto.');
export const finalizeSchema=z.object({operationKey:z.uuid(),sessionId:z.uuid(),payments:z.array(z.object({method:z.enum(['CASH','PIX','DEBIT_CARD','CREDIT_CARD']),amount:moneySchema}).strict()).min(1).max(4)}).strict().refine(d=>new Set(d.payments.map(p=>p.method)).size===d.payments.length,'Agrupe cada forma de pagamento.');
export const cancelSchema=z.object({operationKey:z.uuid(),reason:z.string().trim().min(5).max(500),sessionId:z.uuid().optional()}).strict();
export const openSchema=z.object({operationKey:z.uuid(),registerId:z.uuid(),openingBalance:moneySchema}).strict();
export const closeSchema=z.object({operationKey:z.uuid(),sessionId:z.uuid(),countedBalance:moneySchema}).strict();
export const filters=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),status:z.enum(['ALL','OPEN','FINALIZED','CANCELLED']).default('ALL')});

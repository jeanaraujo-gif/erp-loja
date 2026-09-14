import { z } from 'zod';
import { normalizeDecimal } from '../catalog/decimal';
export const units=(value:string)=>BigInt(value.replace('.',''));
export function quantityText(value:bigint){const negative=value<0n;const text=(negative?-value:value).toString().padStart(4,'0');return `${negative?'-':''}${text.slice(0,-3)}.${text.slice(-3)}`;}
export const quantitySchema=z.string().trim().regex(/^\d{1,15}(?:[.,]\d{1,3})?$/,'Use até três casas decimais, sem separador de milhar.').transform(value=>normalizeDecimal(value,3));
export const movementSchema=z.object({
 productId:z.uuid(),warehouseId:z.uuid(),kind:z.enum(['ENTRY','RETURN','ADJUSTMENT','LOSS','DAMAGE']),
 quantity:quantitySchema,notes:z.string().trim().min(5).max(500),operationKey:z.uuid(),
 expectedRevision:z.number().int().min(0).optional(),
}).strict().refine(data=>data.kind==='ADJUSTMENT'?data.expectedRevision!==undefined:/^\d+\.\d{3}$/.test(data.quantity)&&units(data.quantity)>0n,{message:'Informe uma quantidade positiva ou uma contagem com revisão válida.'});
export const reversalSchema=z.object({operationKey:z.uuid(),notes:z.string().trim().min(5).max(500)}).strict();
export const filterSchema=z.object({warehouseId:z.uuid(),q:z.string().trim().max(100).default(''),level:z.enum(['all','low','zero','above']).default('all'),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
export const historySchema=z.object({productId:z.uuid(),warehouseId:z.uuid(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
export const kindLabels:Record<string,string>={ENTRY:'Entrada',RETURN:'Devolução avulsa',ADJUSTMENT:'Ajuste por contagem',LOSS:'Perda',DAMAGE:'Produto danificado',SALE:'Venda',TRANSFER:'Transferência'};

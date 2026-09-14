import { z } from 'zod';
import { normalizeDecimal } from './decimal';
const optionalText=(max:number)=>z.string().trim().max(max).transform(value=>value||null);
const decimal=(scale:number,digits:number)=>z.string().trim().regex(new RegExp(`^\\d{1,${digits}}(?:[.,]\\d{1,${scale}})?$`),'Use um valor positivo, sem separador de milhar e com as casas decimais permitidas.').transform(value=>normalizeDecimal(value,scale));
export const moneySchema=decimal(2,16);
const quantitySchema=decimal(3,15);
export const categorySchema=z.object({name:z.string().trim().min(1).max(120),active:z.boolean()}).strict();
export const updateCategorySchema=categorySchema.extend({version:z.number().int().positive()});
export const productSchema=z.object({
 name:z.string().trim().min(1).max(160),code:z.string().trim().min(1).max(64),
 barcode:optionalText(64),sku:optionalText(64),description:optionalText(2000),brand:optionalText(100),
 unit:z.string().trim().min(1).max(12).transform(value=>value.toUpperCase()),
 cost:moneySchema,price:moneySchema,minimum:quantitySchema,
 maximum:z.union([z.literal('').transform(()=>null),quantitySchema]),
 location:optionalText(120),photoUrl:z.union([z.literal('').transform(()=>null),z.url().max(2048).refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;},'A foto deve usar uma URL HTTPS sem credenciais.')]),
 categoryId:z.union([z.literal('').transform(()=>null),z.uuid()]),
 supplierIds:z.array(z.uuid()).max(20).refine(ids=>new Set(ids).size===ids.length,'Não repita fornecedores.'),
 active:z.boolean(),
}).strict();
function limits(data:{minimum:string;maximum:string|null}) {return /^\d+\.\d{3}$/.test(data.minimum)&&(data.maximum===null||(/^\d+\.\d{3}$/.test(data.maximum)&&BigInt(data.maximum.replace('.',''))>=BigInt(data.minimum.replace('.',''))));}
export const createProductSchema=productSchema.refine(limits,{message:'O estoque máximo deve ser maior ou igual ao mínimo.',path:['maximum']});
export const updateProductSchema=productSchema.extend({version:z.number().int().positive()}).refine(limits,{message:'O estoque máximo deve ser maior ou igual ao mínimo.',path:['maximum']});
export const filterSchema=z.object({q:z.string().trim().max(100).default(''),status:z.enum(['all','active','inactive']).default('active'),categoryId:z.union([z.literal(''),z.uuid()]).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
export type ProductInput=z.input<typeof productSchema>;

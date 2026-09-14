import { z } from 'zod';
const optional=(max:number)=>z.string().trim().max(max).nullable().optional().transform(v=>v||null);
const document=(pattern:RegExp,message:string)=>z.string().trim().max(30).nullable().optional().transform(v=>v?v.replace(/[.\/\s-]/g,'').toUpperCase():null).refine(v=>v===null||pattern.test(v),message);
const birth=z.string().nullable().optional().transform(v=>v||null).refine(v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&v>='1900-01-01'&&v<=new Date().toISOString().slice(0,10)),'Informe uma data de nascimento válida, entre 1900 e hoje.');
export const customerSchema=z.object({
 name:z.string().trim().min(2,'Informe o nome do cliente.').max(180),tradeName:optional(180),
 cpf:document(/^\d{11}$/,'CPF deve conter 11 dígitos.'),cnpj:document(/^[A-Z0-9]{12}\d{2}$/,'CNPJ deve conter 14 caracteres, com dois dígitos finais.'),
 rg:optional(30),phone:optional(30),whatsapp:optional(30),email:z.string().trim().max(254).nullable().optional().transform(v=>v?.toLowerCase()||null).refine(v=>!v||z.email().safeParse(v).success,'E-mail inválido.'),
 postalCode:document(/^\d{8}$/,'CEP deve conter 8 dígitos.'),street:optional(200),number:optional(30),neighborhood:optional(100),city:optional(100),
 state:optional(2).transform(v=>v?.toUpperCase()||null).refine(v=>!v||['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(v),'UF inválida.'),
 birthDate:birth,notes:optional(2000),active:z.boolean().default(true)
}).strict();
export const updateCustomerSchema=customerSchema.extend({version:z.number().int().positive()});
export const customerFilters=z.object({q:z.string().trim().max(180).default(''),status:z.enum(['all','active','inactive']).default('active'),page:z.coerce.number().int().min(1).max(100000).default(1)});
export const historyFilters=z.object({page:z.coerce.number().int().min(1).max(100000).default(1)});
export type CustomerInput=z.infer<typeof customerSchema>;

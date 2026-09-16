import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres.')
  .max(128, 'A senha deve ter no máximo 128 caracteres.')
  .regex(/[a-z]/, 'A senha deve conter pelo menos uma letra minúscula.')
  .regex(/[A-Z]/, 'A senha deve conter pelo menos uma letra maiúscula.')
  .regex(/[0-9]/, 'A senha deve conter pelo menos um número.')
  .regex(/[^a-zA-Z0-9]/, 'A senha deve conter pelo menos um caractere especial.');
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
export const userSchema = z.object({
 name: z.string().trim().min(2).max(120), email: emailSchema,
 password: passwordSchema, roleCode: z.enum(['ADMIN','MANAGER','SELLER','CASHIER']),
}).strict();
export const updateUserSchema = z.object({
 name: z.string().trim().min(2).max(120),
 roleCode: z.enum(['ADMIN','MANAGER','SELLER','CASHIER']), active: z.boolean(),
}).strict();
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), password: passwordSchema }).strict();
export const idSchema = z.string().uuid();

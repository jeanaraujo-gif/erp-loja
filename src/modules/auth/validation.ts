import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(12, 'Use pelo menos 12 caracteres.').max(128, 'Use até 128 caracteres.');
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

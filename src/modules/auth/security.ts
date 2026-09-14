import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const options = { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 };
let running = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (running >= 4) throw new AuthError(429, 'Muitas tentativas. Aguarde e tente novamente.');
  running++;
  try {
    return await new Promise((resolve, reject) => scrypt(password, salt, 64, options, (err, key) => err ? reject(err) : resolve(key)));
  } finally { running--; }
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$');
  const valid = parts.length === 3 && parts[0] === 'scrypt-v1' && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  // Unknown accounts execute the same expensive derivation without a shared default password.
  const key = await derive(password, valid ? Buffer.from(parts[1], 'hex') : Buffer.alloc(16));
  return valid && timingSafeEqual(key, Buffer.from(parts[2], 'hex'));
}
export function assertOrigin(request: Request, origin: string) {
  if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site')
    throw new AuthError(403, 'Origem da solicitação não permitida. Recarregue a página.');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new AuthError(415, 'Envie os dados em JSON.');
}

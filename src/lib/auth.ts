import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';
import { authService } from '../modules/auth/service';
import { configuration } from '../modules/auth/http';
import { AuthError } from '../modules/auth/security';
export const auth = authService(db);
export async function pageActor() {
 try { return await auth.principal((await cookies()).get(configuration().cookieName)?.value,undefined,true); }
 catch (error) { if (error instanceof AuthError && error.status===401) redirect('/login'); throw error; }
}

import {NextRequest,NextResponse} from 'next/server';
import {customers} from '../../../../lib/customers';
import {body,respond,tokenFrom} from '../../../../modules/auth/http';
type Context={params:Promise<{id:string}>};
export async function GET(r:NextRequest,c:Context){return respond(async()=>NextResponse.json(await customers.get(tokenFrom(r),(await c.params).id)));}
export async function PATCH(r:NextRequest,c:Context){return respond(async()=>NextResponse.json(await customers.save(tokenFrom(r),await body(r,16384),(await c.params).id)));}

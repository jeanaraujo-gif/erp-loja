import {NextRequest,NextResponse} from 'next/server';
import {customers} from '../../../../../lib/customers';
import {respond,tokenFrom} from '../../../../../modules/auth/http';
export async function GET(r:NextRequest,c:{params:Promise<{id:string}>}){return respond(async()=>NextResponse.json(await customers.summary(tokenFrom(r),(await c.params).id)));}

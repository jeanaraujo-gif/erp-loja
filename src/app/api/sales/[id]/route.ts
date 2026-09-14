import {NextRequest,NextResponse} from 'next/server';
import {sales} from '../../../../lib/sales';
import {respond,tokenFrom} from '../../../../modules/auth/http';
export async function GET(r:NextRequest,c:{params:Promise<{id:string}>}){return respond(async()=>NextResponse.json(await sales.get(tokenFrom(r),(await c.params).id)));}

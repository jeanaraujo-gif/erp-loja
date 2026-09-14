import {NextRequest,NextResponse} from 'next/server';
import {sales} from '../../../../../lib/sales';
import {body,respond,tokenFrom} from '../../../../../modules/auth/http';
export async function POST(r:NextRequest,c:{params:Promise<{id:string}>}){return respond(async()=>NextResponse.json(await sales.cancel(tokenFrom(r),(await c.params).id,await body(r))));}

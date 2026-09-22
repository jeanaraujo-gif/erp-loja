import { NextRequest,NextResponse } from 'next/server';
import { orders } from '../../../../lib/orders';
import { respond,tokenFrom } from '../../../../modules/auth/http';
export async function GET(r:NextRequest,{params}:{params:Promise<{id:string}>}){return respond(async()=>NextResponse.json(await orders.get(tokenFrom(r),(await params).id)));}

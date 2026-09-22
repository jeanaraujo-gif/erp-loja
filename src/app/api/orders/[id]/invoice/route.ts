import { NextRequest,NextResponse } from 'next/server';
import { orders } from '../../../../../lib/orders';
import { body,respond,tokenFrom } from '../../../../../modules/auth/http';
export async function POST(r:NextRequest,{params}:{params:Promise<{id:string}>}){return respond(async()=>NextResponse.json(await orders.invoice(tokenFrom(r),(await params).id,await body(r,32768))));}

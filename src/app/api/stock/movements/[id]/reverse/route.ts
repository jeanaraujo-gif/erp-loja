import { NextRequest,NextResponse } from 'next/server';
import { stock } from '../../../../../../lib/stock';
import { body,respond,tokenFrom } from '../../../../../../modules/auth/http';
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){return respond(async()=>{const result=await stock.reverse(tokenFrom(request),(await context.params).id,await body(request));return NextResponse.json(result,{status:result.replayed?200:201});});}

import { NextRequest,NextResponse } from 'next/server';
import { stock } from '../../../../lib/stock';
import { body,respond,tokenFrom } from '../../../../modules/auth/http';
export async function GET(request:NextRequest){return respond(async()=>NextResponse.json(await stock.history(tokenFrom(request),Object.fromEntries(request.nextUrl.searchParams))));}
export async function POST(request:NextRequest){return respond(async()=>{const result=await stock.create(tokenFrom(request),await body(request));return NextResponse.json(result,{status:result.replayed?200:201});});}

import { NextRequest,NextResponse } from 'next/server';
import { stock } from '../../../lib/stock';
import { respond,tokenFrom } from '../../../modules/auth/http';
export async function GET(request:NextRequest){return respond(async()=>NextResponse.json(await stock.list(tokenFrom(request),Object.fromEntries(request.nextUrl.searchParams))));}

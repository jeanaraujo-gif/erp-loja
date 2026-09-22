import { NextRequest,NextResponse } from 'next/server';
import { orders } from '../../../lib/orders';
import { respond,tokenFrom } from '../../../modules/auth/http';
export async function GET(r:NextRequest){return respond(async()=>NextResponse.json(await orders.list(tokenFrom(r),Object.fromEntries(r.nextUrl.searchParams))));}

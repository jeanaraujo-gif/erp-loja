import {NextRequest,NextResponse} from 'next/server';
import {sales} from '../../../../lib/sales';
import {respond,tokenFrom} from '../../../../modules/auth/http';
export async function GET(r:NextRequest){return respond(async()=>NextResponse.json(await sales.lookup(tokenFrom(r),Object.fromEntries(r.nextUrl.searchParams))));}

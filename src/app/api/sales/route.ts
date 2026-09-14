import {NextRequest,NextResponse} from 'next/server';
import {sales} from '../../../lib/sales';
import {body,respond,tokenFrom} from '../../../modules/auth/http';
export async function GET(r:NextRequest){return respond(async()=>NextResponse.json(await sales.list(tokenFrom(r),Object.fromEntries(r.nextUrl.searchParams))));}
export async function POST(r:NextRequest){return respond(async()=>NextResponse.json(await sales.create(tokenFrom(r),await body(r,32768)),{status:201}));}

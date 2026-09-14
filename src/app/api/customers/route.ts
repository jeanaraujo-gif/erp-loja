import {NextRequest,NextResponse} from 'next/server';
import {customers} from '../../../lib/customers';
import {body,respond,tokenFrom} from '../../../modules/auth/http';
export async function GET(r:NextRequest){return respond(async()=>NextResponse.json(await customers.list(tokenFrom(r),Object.fromEntries(r.nextUrl.searchParams))));}
export async function POST(r:NextRequest){return respond(async()=>NextResponse.json(await customers.save(tokenFrom(r),await body(r,16384)),{status:201}));}

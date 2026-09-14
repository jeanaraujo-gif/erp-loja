import {NextRequest,NextResponse} from 'next/server';
import {sales} from '../../../../../lib/sales';
import {body,respond,tokenFrom} from '../../../../../modules/auth/http';
export async function POST(r:NextRequest){return respond(async()=>NextResponse.json(await sales.openCash(tokenFrom(r),await body(r))));}

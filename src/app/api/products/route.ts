import { NextRequest,NextResponse } from 'next/server';
import { catalog } from '../../../lib/catalog';
import { body,respond,tokenFrom } from '../../../modules/auth/http';
export async function GET(request:NextRequest){return respond(async()=>NextResponse.json(await catalog.list(tokenFrom(request),Object.fromEntries(request.nextUrl.searchParams))));}
export async function POST(request:NextRequest){return respond(async()=>NextResponse.json(await catalog.save(tokenFrom(request),await body(request,16384)),{status:201}));}

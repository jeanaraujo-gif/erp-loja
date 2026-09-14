import { NextRequest,NextResponse } from 'next/server';
import { catalog } from '../../../../lib/catalog';
import { body,respond,tokenFrom } from '../../../../modules/auth/http';
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,context:Context){return respond(async()=>NextResponse.json(await catalog.get(tokenFrom(request),(await context.params).id)));}
export async function PATCH(request:NextRequest,context:Context){return respond(async()=>NextResponse.json(await catalog.save(tokenFrom(request),await body(request,16384),(await context.params).id)));}

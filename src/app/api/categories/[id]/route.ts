import { NextRequest,NextResponse } from 'next/server';
import { catalog } from '../../../../lib/catalog';
import { body,respond,tokenFrom } from '../../../../modules/auth/http';
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){return respond(async()=>NextResponse.json(await catalog.saveCategory(tokenFrom(request),await body(request),(await context.params).id)));}

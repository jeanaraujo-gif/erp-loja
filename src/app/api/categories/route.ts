import { NextRequest,NextResponse } from 'next/server';
import { catalog } from '../../../lib/catalog';
import { body,respond,tokenFrom } from '../../../modules/auth/http';
export async function GET(request:NextRequest){return respond(async()=>NextResponse.json({categories:await catalog.categories(tokenFrom(request))}));}
export async function POST(request:NextRequest){return respond(async()=>NextResponse.json(await catalog.saveCategory(tokenFrom(request),await body(request)),{status:201}));}

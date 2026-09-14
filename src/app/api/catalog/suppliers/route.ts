import { NextRequest,NextResponse } from 'next/server';
import { catalog } from '../../../../lib/catalog';
import { respond,tokenFrom } from '../../../../modules/auth/http';
export async function GET(request:NextRequest){return respond(async()=>NextResponse.json({suppliers:await catalog.suppliers(tokenFrom(request))}));}

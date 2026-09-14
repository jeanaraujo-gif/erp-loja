import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { body, respond, tokenFrom } from '../../../modules/auth/http';
export async function GET(request: NextRequest) {
 return respond(async () => NextResponse.json({users:await auth.listUsers(tokenFrom(request))}));
}
export async function POST(request: NextRequest) {
 return respond(async () => { const data=await body(request); return NextResponse.json(await auth.createUser(tokenFrom(request),data),{status:201}); });
}

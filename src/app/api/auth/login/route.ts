import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { body, respond, setSession, tokenFrom } from '../../../../modules/auth/http';
export async function POST(request: NextRequest) {
 return respond(async () => {
  const result = await auth.login(await body(request),tokenFrom(request));
  const response = NextResponse.json({user:result.actor}); setSession(response,result.token); return response;
 });
}

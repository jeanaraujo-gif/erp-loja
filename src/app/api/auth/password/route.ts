import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { body, respond, setSession, tokenFrom } from '../../../../modules/auth/http';
export async function POST(request: NextRequest) {
 return respond(async () => { const data=await body(request); await auth.changePassword(tokenFrom(request),data); const response=NextResponse.json({ok:true}); setSession(response,'',true); return response; });
}

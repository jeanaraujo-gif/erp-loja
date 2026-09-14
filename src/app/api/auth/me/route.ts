import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { respond, tokenFrom } from '../../../../modules/auth/http';
export async function GET(request: NextRequest) {
 return respond(async () => NextResponse.json({user:await auth.principal(tokenFrom(request),undefined,true)}));
}

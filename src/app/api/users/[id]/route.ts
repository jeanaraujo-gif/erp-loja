import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';
import { body, respond, tokenFrom } from '../../../../modules/auth/http';
export async function PATCH(request: NextRequest, context: {params:Promise<{id:string}>}) {
 return respond(async () => { const data=await body(request); await auth.updateUser(tokenFrom(request),(await context.params).id,data); return NextResponse.json({ok:true}); });
}

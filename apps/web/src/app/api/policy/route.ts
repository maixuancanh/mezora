import {assertFeature} from '@/server/features';
import {requireRole} from '../../../../../../packages/db/src/memberships';
import {NextRequest,NextResponse} from 'next/server';
import {workspaceIdentity} from '@/server/auth';
import {readBody,modeOf,errorResponse,workspaceResponse} from '@/server/http';
import {database} from '../../../../../../packages/db/src/database';
import {money} from '../../../../../../packages/db/src/workspace';
import {policyRead,policyMutation} from '@/server/policy';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{assertFeature('policy');const mode=modeOf(req.nextUrl.searchParams.get('mode')),i=await workspaceIdentity(mode);return NextResponse.json(await policyRead(await database(),i.id,mode),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest){try{assertFeature('policy');const b=await readBody(req),mode=modeOf(b.mode),i=await workspaceIdentity(mode);await requireRole(await database(),i.id,i.actor||'scenario',['owner']);const url=new URL(req.url);url.searchParams.set('mode',mode);const snapshot=await workspaceResponse(new NextRequest(url,{headers:req.headers}));return NextResponse.json(await policyMutation(await database(),i.id,mode,i.owner||'scenario',b,money(snapshot.summary.available)));}catch(e){return errorResponse(e);}}

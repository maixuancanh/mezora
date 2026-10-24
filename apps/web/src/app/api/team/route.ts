import {assertFeature} from '@/server/features';
import {NextRequest,NextResponse} from 'next/server';import {cookies} from 'next/headers';
import {workspaceIdentity,sessionAddress} from '@/server/auth';import {readBody,errorResponse} from '@/server/http';import {database} from '../../../../../../packages/db/src/database';import {requireRole} from '../../../../../../packages/db/src/memberships';
import {teamRead,teamMutation,acceptInvite,ensureOwnerMember} from '@/server/memberships';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{assertFeature('team');const actor=await sessionAddress();if(!actor)throw new Error('Connect and sign in with your wallet.');const i=await workspaceIdentity('live'),db=await database();await ensureOwnerMember(db,'live:'+actor.toLowerCase(),actor);return NextResponse.json(await teamRead(db,i.id,actor),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest){try{assertFeature('team');const b=await readBody(req),actor=await sessionAddress();if(!actor)throw new Error('Connect and sign in with your wallet.');const db=await database();if(b.action==='accept')return NextResponse.json(await acceptInvite(db,actor,String(b.token)));
 if(b.action==='switch'){const ns=String(b.workspaceId);await requireRole(db,ns,actor,['owner','requester','reviewer','viewer']);(await cookies()).set('mezora-workspace',ns,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',maxAge:86400});return NextResponse.json({selected:ns});}
 const i=await workspaceIdentity('live');await ensureOwnerMember(db,i.id,actor);return NextResponse.json(await teamMutation(db,i.id,actor,b));}catch(e){return errorResponse(e);}}

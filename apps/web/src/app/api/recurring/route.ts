import {assertFeature} from '@/server/features';
import {requireRole} from '../../../../../../packages/db/src/memberships';
import {NextRequest,NextResponse} from 'next/server';
import {workspaceIdentity} from '@/server/auth';
import {readBody,modeOf,errorResponse} from '@/server/http';
import {database} from '../../../../../../packages/db/src/database';
import {recurringList,recurringMutation} from '@/server/recurring';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{assertFeature('recurring');const mode=modeOf(req.nextUrl.searchParams.get('mode')),i=await workspaceIdentity(mode);return NextResponse.json({templates:await recurringList(await database(),i.id),schedule:'on_demand'},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest){try{assertFeature('recurring');const b=await readBody(req),mode=modeOf(b.mode),i=await workspaceIdentity(mode);await requireRole(await database(),i.id,i.actor||'scenario',['owner']);return NextResponse.json(await recurringMutation(await database(),i.id,mode,i.owner||'scenario',b));}catch(e){return errorResponse(e);}}

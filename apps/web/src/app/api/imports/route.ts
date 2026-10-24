import {assertFeature} from '@/server/features';
import {requireRole} from '../../../../../../packages/db/src/memberships';
import {NextRequest,NextResponse} from 'next/server';
import {workspaceIdentity} from '@/server/auth';
import {checkOrigin,modeOf,errorResponse} from '@/server/http';
import {database} from '../../../../../../packages/db/src/database';
import {previewImport,commitImport} from '@/server/imports';
export const runtime='nodejs';
export async function POST(req:NextRequest){try{assertFeature('imports');checkOrigin(req);const reader=req.body?.getReader();if(!reader)throw new Error('JSON body required.');const chunks:Uint8Array[]=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>3*1024*1024){await reader.cancel();throw new Error('Import request is too large.');}chunks.push(part.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const b=JSON.parse(new TextDecoder().decode(bytes));const mode=modeOf(b.mode),identity=await workspaceIdentity(mode),db=await database();await requireRole(db,identity.id,identity.actor||'scenario',['owner']);
 if(b.action==='preview'&&typeof b.csv==='string')return NextResponse.json(await previewImport(db,identity.id,mode,b.csv));
 if(b.action==='commit'&&typeof b.id==='string')return NextResponse.json(await commitImport(db,identity.id,mode,identity.owner||'scenario',b.id,b.selectedRows));throw new Error('Unknown import action.');}catch(e){return errorResponse(e);}}

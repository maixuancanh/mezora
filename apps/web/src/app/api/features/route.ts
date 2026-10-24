import {NextResponse} from 'next/server';import {workbenchFeatures} from '@/server/features';
export const dynamic='force-dynamic';
export async function GET(){return NextResponse.json(workbenchFeatures(),{headers:{'Cache-Control':'no-store'}});}

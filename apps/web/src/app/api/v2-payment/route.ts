import {NextRequest,NextResponse} from 'next/server';
import {paymentAction,paymentState,paymentReview} from '../../../server/v2-payment';
import {database} from '../../../../../../packages/db/src/database';
import {readBody,errorResponse} from '../../../server/http';
import {sessionAddress} from '../../../server/auth';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{return NextResponse.json({state:await paymentState(),review:await paymentReview(await database(),req.nextUrl.searchParams.get('id')||undefined)},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest){try{return NextResponse.json(await paymentAction(await readBody(req),await sessionAddress()));}catch(e){return errorResponse(e);}}

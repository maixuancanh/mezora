import {NextRequest,NextResponse} from 'next/server';
import {paymentAction,paymentState,paymentReview,paymentReceipts} from '../../../server/v2-payment';
import {database} from '../../../../../../packages/db/src/database';
import {readBody,errorResponse} from '../../../server/http';
import {sessionAddress} from '../../../server/auth';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{const db=await database();return NextResponse.json({state:await paymentState(),review:await paymentReview(db,req.nextUrl.searchParams.get('id')||undefined),receipts:await paymentReceipts(db)},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest){try{return NextResponse.json(await paymentAction(await readBody(req),await sessionAddress()));}catch(e){return errorResponse(e);}}

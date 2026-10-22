import { NextRequest,NextResponse } from "next/server";
import {billsPost,errorResponse} from "@/server/http";
export const runtime="nodejs";
export async function POST(req:NextRequest){try{return NextResponse.json(await billsPost(req));}catch(e){return errorResponse(e);}}


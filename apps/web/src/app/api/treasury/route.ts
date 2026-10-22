import { NextRequest,NextResponse } from "next/server";
import {treasuryPost,errorResponse} from "@/server/http";
export const runtime="nodejs";
export async function POST(req:NextRequest){try{return NextResponse.json(await treasuryPost(req));}catch(e){return errorResponse(e);}}

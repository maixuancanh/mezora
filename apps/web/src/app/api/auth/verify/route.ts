import { NextRequest,NextResponse } from "next/server";
import {verifySession} from "@/server/auth";import {readBody,errorResponse} from "@/server/http";
export const runtime="nodejs";
export async function POST(req:NextRequest){try{const b=await readBody(req);return NextResponse.json(await verifySession(b.address,b.signature,b.message));}catch(e){return errorResponse(e);}}


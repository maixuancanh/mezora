import { NextRequest,NextResponse } from "next/server";
import {verifySession} from "@/server/auth";import {readBody,errorResponse} from "@/server/http";
import{requestOrigin}from"@/server/origin";
export const runtime="nodejs";
export async function POST(req:NextRequest){try{const b=await readBody(req);if(typeof b.message!=="string"||!b.message.split("\n").includes("Origin: "+requestOrigin(req)))throw new Error("Sign-in message origin does not match this deployment.");return NextResponse.json(await verifySession(b.address,b.signature,b.message));}catch(e){return errorResponse(e);}}

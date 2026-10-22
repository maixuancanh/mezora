import { NextRequest,NextResponse } from "next/server";
import {workspaceResponse,errorResponse} from "@/server/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){try{return NextResponse.json(await workspaceResponse(req),{headers:{"Cache-Control":"no-store"}});}catch(e){return errorResponse(e);}}


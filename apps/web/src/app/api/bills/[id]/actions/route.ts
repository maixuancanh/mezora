import { NextRequest,NextResponse } from "next/server";
import {billActionPost,errorResponse} from "@/server/http";
export const runtime="nodejs";
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){try{return NextResponse.json(await billActionPost(req,(await ctx.params).id));}catch(e){return errorResponse(e);}}

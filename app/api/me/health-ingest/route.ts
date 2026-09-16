import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
export const dynamic="force-dynamic"; export const runtime="nodejs";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function POST(request:NextRequest){try{const user=await getOrCreateCurrentUser(request);const token=`ont_${randomBytes(32).toString("base64url")}`;await databaseQuery("INSERT INTO food_catalog.app.health_ingest_tokens (user_id,token_hash,created_at,revoked_at) VALUES ($1,$2,now(),NULL) ON CONFLICT (user_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=now(),revoked_at=NULL",[user.id,hash(token)]);return attachCurrentUserCookie(NextResponse.json({token},{status:201}),user);}catch(error){return NextResponse.json({message:error instanceof DatabaseNotConfiguredError?"Set DATABASE_URL on the server.":"Health token storage is temporarily unavailable."},{status:503});}}
export async function DELETE(request:NextRequest){try{const user=await getOrCreateCurrentUser(request);await databaseQuery("UPDATE food_catalog.app.health_ingest_tokens SET revoked_at=now() WHERE user_id=$1",[user.id]);return attachCurrentUserCookie(new NextResponse(null,{status:204}),user);}catch(error){return NextResponse.json({message:error instanceof DatabaseNotConfiguredError?"Set DATABASE_URL on the server.":"Health token storage is temporarily unavailable."},{status:503});}}

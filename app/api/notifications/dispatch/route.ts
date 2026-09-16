import { NextRequest, NextResponse } from "next/server";
import { dispatchDailyReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Invoke from a trusted scheduler every five minutes to deliver due daily reminders. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json(await dispatchDailyReminders());
  } catch (error) {
    console.error("Dispatch notifications failed", error);
    return NextResponse.json({ message: "Reminder dispatch is temporarily unavailable." }, { status: 503 });
  }
}

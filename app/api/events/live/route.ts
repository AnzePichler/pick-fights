import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLiveStatus } from "@/lib/live-status";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  return NextResponse.json({ event: await getLiveStatus() }, { headers: { "Cache-Control": "private, no-store" } });
}

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { applyResults, resultSchema, ResultError, withEventLock } from "@/lib/results";

const updateResultsSchema = z.object({
  eventId: z.string().min(1),
  markCompleted: z.boolean().default(false),
  results: z.array(resultSchema).max(50),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "You are not allowed to update results." }, { status: 403 });
  try {
    const parsed = updateResultsSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid result data." }, { status: 400 });
    const { eventId, results, markCompleted } = parsed.data;
    const outcome = await withEventLock(prisma, eventId, (transaction) => applyResults(transaction, eventId, results, "MANUAL", markCompleted));
    if (outcome.changed) revalidateTag("leaderboards", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ResultError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    console.error("Failed to update results", error);
    return NextResponse.json({ error: "Failed to update results." }, { status: 500 });
  }
}

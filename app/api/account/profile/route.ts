// app/api/account/profile/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(30, "Display name must be 30 characters or fewer."),
  imageUrl: z
    .string()
    .max(750_000, "Image is too large.")
    .refine(
      (value) =>
        value === "" ||
        value.startsWith("data:image/") ||
        value.startsWith("https://") ||
        value.startsWith("http://"),
      "Invalid image.",
    ),
});

export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: "You must be logged in.",
        },
        {
          status: 401,
        },
      );
    }

    const body = await request.json();
    const parsed = profileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Invalid profile data.",
        },
        {
          status: 400,
        },
      );
    }

    const { displayName, imageUrl } = parsed.data;

    const user = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        displayName,
        imageUrl: imageUrl || null,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        imageUrl: true,
      },
    });

    return NextResponse.json({
      user,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Failed to update profile.",
      },
      {
        status: 500,
      },
    );
  }
}

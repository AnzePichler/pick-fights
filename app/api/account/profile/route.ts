// app/api/account/profile/route.ts
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AvatarValidationError, parseProfileImage, readProfileBody } from "@/lib/avatars";

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(30, "Display name must be 30 characters or fewer."),
  imageUrl: z.string().trim(),
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

    const userId = session.user.id;
    const body = await readProfileBody(request);
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
    const image = parseProfileImage(imageUrl);

    const user = await prisma.$transaction(async (transaction) => {
      let storedImageUrl: string | null = null;

      if (image.kind === "existing") {
        const avatar = await transaction.userAvatar.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (avatar?.id !== image.id) {
          throw new AvatarValidationError("Please use your own current profile picture.");
        }
        storedImageUrl = image.url;
      } else {
        await transaction.userAvatar.deleteMany({ where: { userId } });
        if (image.kind === "upload") {
          const avatar = await transaction.userAvatar.create({
            data: { userId, contentType: image.contentType, data: image.data },
            select: { id: true },
          });
          storedImageUrl = `/api/avatars/${avatar.id}`;
        } else if (image.kind === "external") {
          storedImageUrl = image.url;
        }
      }

      return transaction.user.update({
        where: {
          id: userId,
        },
        data: {
          displayName,
          imageUrl: storedImageUrl,
        },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          imageUrl: true,
        },
      });
    });

    revalidateTag("leaderboards", { expire: 0 });

    return NextResponse.json({
      user,
    });
  } catch (error) {
    if (error instanceof AvatarValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to update profile.");

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

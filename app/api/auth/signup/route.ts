// app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const signupSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters.")
    .max(24, "Username must be 24 characters or fewer.")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores.",
    ),
  password: z.string().min(8, "Password must be at least 8 characters."),
  inviteCode: z.string().min(1, "Invite code is required."),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Invalid signup data.",
        },
        {
          status: 400,
        },
      );
    }

    const { email, username, password, inviteCode } = parsed.data;

    if (!process.env.INVITE_CODE) {
      return NextResponse.json(
        {
          error: "Server is missing INVITE_CODE.",
        },
        {
          status: 500,
        },
      );
    }

    if (inviteCode !== process.env.INVITE_CODE) {
      return NextResponse.json(
        {
          error: "Invalid invite code.",
        },
        {
          status: 403,
        },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
      },
    });

    return NextResponse.json(
      {
        user,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: "Email or username is already taken.",
        },
        {
          status: 409,
        },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error: "Failed to create account.",
      },
      {
        status: 500,
      },
    );
  }
}

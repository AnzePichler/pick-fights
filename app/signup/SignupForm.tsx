// app/signup/SignupForm.tsx
"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    const email = String(formData.get("email") || "");
    const username = String(formData.get("username") || "");
    const password = String(formData.get("password") || "");
    const inviteCode = String(formData.get("inviteCode") || "");

    const signupResponse = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        username,
        password,
        inviteCode,
      }),
    });

    const signupData = await signupResponse.json();

    if (!signupResponse.ok) {
      setIsSubmitting(false);
      setError(signupData.error || "Failed to sign up.");
      return;
    }

    const loginResponse = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (!loginResponse || loginResponse.error) {
      setError("Account created, but login failed. Try logging in manually.");
      return;
    }

    router.push("/picks");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-black">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-3xl bg-white p-8 shadow-sm"
      >
        <div>
          <h1 className="text-3xl font-black tracking-tight">Sign up</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Create your account with the invite code.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-bold text-neutral-700">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-blue-500"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-bold text-neutral-700">Username</span>
          <input
            name="username"
            type="text"
            required
            autoComplete="username"
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-blue-500"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-bold text-neutral-700">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-blue-500"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-bold text-neutral-700">
            Invite code
          </span>
          <input
            name="inviteCode"
            type="text"
            required
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:border-blue-500"
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {isSubmitting ? "Creating account..." : "Sign up"}
        </button>

        <p className="text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <a href="/login" className="font-bold text-blue-600">
            Log in
          </a>
        </p>
      </form>
    </main>
  );
}

// app/signup/page.tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import SignupForm from "./SignupForm";

export default async function SignupPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/picks");
  }

  return <SignupForm />;
}

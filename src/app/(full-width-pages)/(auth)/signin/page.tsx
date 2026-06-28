import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next.js SignIn Page | uniMate - Admin & Teacher Dashboard",
  description: "This is Next.js Signin Page uniMate - Admin & Teacher Dashboard",
};

export default function SignIn() {
  return <SignInForm />;
}

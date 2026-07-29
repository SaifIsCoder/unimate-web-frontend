import { Suspense } from "react";
import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

// Just the page name — the root layout's `title.template` appends
// "| UniMate Dashboard" automatically.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the UniMate admin and teacher dashboard.",
};

export default function SignIn() {
  // SignInForm reads `?next=` via useSearchParams, which opts the subtree into
  // client-side rendering. Next requires an explicit Suspense boundary around
  // that, or the production build fails while prerendering this page.
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <span className="sr-only">Loading sign-in form</span>
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}

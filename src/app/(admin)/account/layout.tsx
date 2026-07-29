import type { Metadata } from "next";

// Pattern for every page from here on: export only the page's own name and let
// the root layout's `title.template` add the "| UniMate Dashboard" suffix.
// Client components ("use client") cannot export metadata, so pages that need a
// title get a thin server layout like this one.
export const metadata: Metadata = {
  title: "Account",
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}

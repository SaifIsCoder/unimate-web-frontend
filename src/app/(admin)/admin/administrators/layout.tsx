import type { Metadata } from "next";
import RequireRole from "@/components/auth/RequireRole";

export const metadata: Metadata = {
  title: "Administrators",
};

/**
 * Super-admin-only subtree.
 *
 * Third of three layers, and the only one that is a hard gate in the client
 * tree: `proxy.ts` blocks the route at the edge, `lib/navigation.tsx` hides the
 * link, and this stops a direct render if either is bypassed. The API is still
 * the real boundary.
 *
 * Note `super_admin` must be named explicitly — `hasRole` expands
 * super_admin → admin, not the reverse, so an `admin` gate would let plain
 * admins in.
 */
export default function AdministratorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireRole roles={["super_admin"]}>{children}</RequireRole>;
}

"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { hasRole, homePathForRole } from "@/lib/session";

type RequireRoleProps = {
  children: React.ReactNode;
  /** Roles allowed to view this subtree. Omit to only require "logged in". */
  roles?: readonly string[];
};

/**
 * Client-side role gate.
 *
 * `middleware.ts` already blocks these routes at the edge, so this is the second
 * of two layers — it catches the window between hydration and a stale or forged
 * session hint, and keeps the guarantee if middleware is ever bypassed.
 *
 * Neither layer is the security boundary: the API authorises every request
 * independently. This exists so users never see a screen they cannot use.
 */
export default function RequireRole({ children, roles }: RequireRoleProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // `hasRole` applies the API's hierarchy, so a `super_admin` clears an
  // `admin` gate without the caller naming both roles.
  const isAuthorized = Boolean(user) && (!roles || hasRole(user?.role, roles));

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/signin");
      return;
    }

    if (roles && !hasRole(user.role, roles)) {
      // Logged in, but this subtree isn't for their role — bounce to their own home.
      router.replace(homePathForRole(user.role));
    }
  }, [loading, user, roles, router]);

  if (loading || !isAuthorized) {
    return (
      <div
        className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
        <span className="sr-only">Checking your access</span>
      </div>
    );
  }

  return <>{children}</>;
}

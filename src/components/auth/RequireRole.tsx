"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homePathForRole, useAuth } from "@/context/AuthContext";

type RequireRoleProps = {
  children: React.ReactNode;
  /** Roles allowed to view this subtree. Omit to only require "logged in". */
  roles?: string[];
};

export default function RequireRole({ children, roles }: RequireRoleProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const isAuthorized = Boolean(user) && (!roles || roles.includes(user!.role));

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/signin");
      return;
    }

    if (roles && !roles.includes(user.role)) {
      // Logged in, but this subtree isn't for their role — bounce to their own home.
      router.replace(homePathForRole(user.role));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, roles]);

  if (loading || !isAuthorized) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

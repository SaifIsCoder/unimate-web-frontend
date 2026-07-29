"use client";

import RequireRole from "@/components/auth/RequireRole";
import React from "react";

export default function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireRole roles={["admin", "super_admin"]}>{children}</RequireRole>;
}

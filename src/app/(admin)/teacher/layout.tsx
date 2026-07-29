"use client";

import RequireRole from "@/components/auth/RequireRole";
import React from "react";

export default function TeacherSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireRole roles={["teacher"]}>{children}</RequireRole>;
}

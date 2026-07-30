"use client";

import React, { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import FeedbackBanner, { errorMessage, type Feedback } from "@/components/admin/FeedbackBanner";
import { useAuth } from "@/context/AuthContext";
import {
  getMyAdminRecord,
  getMyProfile,
  isAdminProfile,
  isTeacherProfile,
  type AdminRecord,
  type MeProfile,
} from "@/services/profileService";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Administrator",
  teacher: "Teacher",
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-800 dark:text-white/90">
        {value || <span className="text-gray-400 dark:text-gray-500">Not set</span>}
      </dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [adminRecord, setAdminRecord] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const isAdminRole = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The admin record is optional context, so it is fetched alongside rather
      // than gating the page — getMyAdminRecord already swallows its own errors.
      const [me, record] = await Promise.all([
        getMyProfile(),
        isAdminRole ? getMyAdminRecord() : Promise.resolve(null),
      ]);
      setProfile(me);
      setAdminRecord(record);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "Could not load your account",
        message: errorMessage(error, "Please try again in a moment."),
      });
    } finally {
      setLoading(false);
    }
  }, [isAdminRole]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Profile</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Your identity as the UniMate API sees it.
        </p>
      </div>

      {/*
        This page is read-only by necessity, not by choice — the API has no
        endpoint that can back an edit form (BE-6 in
        dashboard_architecture_plan.md):
          - /auth/reset-password and /auth/set-password reject admins outright
            (403) and, for teachers, work exactly once — `password_changed`
            locks them out afterwards.
          - PATCH /teachers/:id is admin-only, so there is no self-service
            profile update for the person actually viewing this page.
        Saying so plainly beats rendering inputs that would fail on submit.
      */}
      <div
        role="note"
        className="flex gap-3 rounded-xl border border-blue-light-300 bg-blue-light-50 px-4 py-3 dark:border-blue-light-800 dark:bg-blue-light-500/10"
      >
        <svg
          className="mt-0.5 shrink-0 text-blue-light-500"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-sm text-blue-light-700 dark:text-blue-light-400">
          To update your profile details or reset your password, please contact a
          system administrator.
        </p>
      </div>

      <FeedbackBanner feedback={feedback} />

      {loading ? (
        <ComponentCard title="Loading…">
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
          <span className="sr-only">Loading your account details</span>
        </ComponentCard>
      ) : (
        <>
          <ComponentCard title="Profile">
            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Name" value={profile?.name} />
              <Field label="Email" value={profile?.personal?.email ?? user?.email} />
              <Field label="Role" value={ROLE_LABEL[user?.role ?? ""] ?? user?.role} />
              {profile && isTeacherProfile(profile) && (
                <Field label="Employee ID" value={profile.employeeId} />
              )}
              {profile && isAdminProfile(profile) && (
                <Field label="Admin ID" value={adminRecord?.admin_id ?? profile.adminId} />
              )}
              {adminRecord && (
                <Field
                  label="Department"
                  value={
                    adminRecord.department_name
                      ? `${adminRecord.department_name} (${adminRecord.department_code})`
                      : null
                  }
                />
              )}
            </dl>

            {isAdminRole && adminRecord && !adminRecord.department_id && (
              <p className="mt-5 rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                No department is linked to this admin account. The API scopes
                announcements and community moderation by department, so both will
                be rejected until a department is assigned.
              </p>
            )}
          </ComponentCard>

          <ComponentCard title="Password">
            {/*
              Deliberately informational. The API's password endpoints cannot
              serve this screen yet:
                - /auth/reset-password and /auth/set-password reject admins (403)
                  and, for teachers, work exactly once — `password_changed`
                  locks them out afterwards.
                - There is no authenticated "change my password" endpoint that
                  verifies the current password and can be used repeatedly.
              Tracked as BE-6 in dashboard_architecture_plan.md. Showing a form
              that mostly 403s would be worse than showing nothing.
            */}
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Password changes are not yet self-service.
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {user?.role === "teacher"
                ? "Teachers may set a password once, during first sign-in. To change it again, ask an administrator to reset your account."
                : "Administrator passwords are managed through user provisioning. Ask a super admin to reset your account."}
            </p>
          </ComponentCard>
        </>
      )}
    </div>
  );
}

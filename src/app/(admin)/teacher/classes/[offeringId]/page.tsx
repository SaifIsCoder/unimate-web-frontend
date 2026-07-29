"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import { errorMessage } from "@/components/admin/FeedbackBanner";
import RosterPanel from "@/components/teacher/RosterPanel";
import AttendancePanel from "@/components/teacher/AttendancePanel";
import GradesPanel from "@/components/teacher/GradesPanel";
import ClassAnnouncementPanel from "@/components/teacher/ClassAnnouncementPanel";
import { listEnrollmentsByOffering } from "@/services/enrollmentService";
import { listMyOfferings } from "@/services/teachingService";
import type { Enrollment, TeachingOffering } from "@/types/academics";

const TABS = ["Roster", "Attendance", "Grades", "Announce"] as const;
type Tab = (typeof TABS)[number];

export default function ClassDetailPage() {
  const params = useParams<{ offeringId: string }>();
  const offeringId = params.offeringId;

  const [tab, setTab] = useState<Tab>("Roster");
  const [offerings, setOfferings] = useState<TeachingOffering[]>([]);
  const [roster, setRoster] = useState<Enrollment[]>([]);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  useEffect(() => {
    listMyOfferings()
      .then(setOfferings)
      .catch(() => setOfferings([]))
      .finally(() => setLoadingOfferings(false));
  }, []);

  const loadRoster = useCallback(async () => {
    if (!offeringId) return;
    setRosterLoading(true);
    try {
      const page = await listEnrollmentsByOffering(offeringId);
      setRoster(page.data);
      setRosterError(null);
    } catch (error) {
      setRoster([]);
      setRosterError(
        errorMessage(error, "Could not load the roster for this class."),
      );
    } finally {
      setRosterLoading(false);
    }
  }, [offeringId]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const offering = useMemo(
    () => offerings.find((entry) => entry.id === offeringId) ?? null,
    [offerings, offeringId],
  );

  // A teacher reaching an offering they don't own gets a 403 from the roster
  // call; treat "not in my offerings" as the same thing and say so plainly.
  if (!loadingOfferings && !offering) {
    return (
      <div className="space-y-6">
        <ComponentCard title="Class not found">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This class isn&apos;t one of yours, or it no longer exists. You can only open
            offerings assigned to you.
          </p>
          <Link href="/teacher" className="text-sm font-medium text-brand-500">
            ← Back to your classes
          </Link>
        </ComponentCard>
      </div>
    );
  }

  const activeCount = roster.filter((row) => row.status === "enrolled").length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/teacher"
          className="text-sm text-gray-500 hover:text-brand-500 dark:text-gray-400"
        >
          ← Your classes
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
              {offering ? `${offering.course_code} · Section ${offering.section}` : "Loading…"}
            </h2>
            {offering && (
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {offering.course_title} · {offering.semester}
              </p>
            )}
          </div>
          {offering && (
            <div className="flex flex-wrap gap-2">
              <Badge size="sm" color="light">
                {activeCount}/{offering.capacity} enrolled
              </Badge>
              <Badge size="sm" color="info">
                Weights {Number(offering.mid_weight)}/{Number(offering.sessional_weight)}/
                {Number(offering.final_weight)}/{Number(offering.practical_weight)}
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
        {TABS.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setTab(entry)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === entry
                ? "border-brand-500 text-brand-500"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {entry}
          </button>
        ))}
      </div>

      {tab === "Roster" && (
        <RosterPanel roster={roster} loading={rosterLoading} error={rosterError} />
      )}

      {tab === "Attendance" && offeringId && (
        <AttendancePanel
          offeringId={offeringId}
          roster={roster}
          rosterLoading={rosterLoading}
        />
      )}

      {tab === "Grades" && offering && (
        <GradesPanel offering={offering} roster={roster} rosterLoading={rosterLoading} />
      )}

      {tab === "Announce" && offering && (
        <ClassAnnouncementPanel offering={offering} allOfferings={offerings} />
      )}
    </div>
  );
}

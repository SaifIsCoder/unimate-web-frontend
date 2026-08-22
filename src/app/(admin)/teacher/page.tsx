"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import { errorMessage } from "@/components/admin/FeedbackBanner";
import { useAuth } from "@/context/AuthContext";
import TeacherAnalytics from "@/components/dashboard/TeacherAnalytics";
import { getMyTimetable, listMyOfferings } from "@/services/teachingService";
import {
  DAY_ORDER,
  type TeachingOffering,
  type TeachingTimetable,
} from "@/types/academics";

/** "13:30:00" -> "1:30 PM" */
const formatTime = (value: string): string => {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

const todayName = () =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    new Date().getDay()
  ];

export default function TeacherHomePage() {
  const { user } = useAuth();
  const [offerings, setOfferings] = useState<TeachingOffering[]>([]);
  const [timetable, setTimetable] = useState<TeachingTimetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [offeringsError, setOfferingsError] = useState<string | null>(null);
  const [timetableError, setTimetableError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [offeringsResult, timetableResult] = await Promise.allSettled([
        listMyOfferings(),
        getMyTimetable(),
      ]);
      if (cancelled) return;

      if (offeringsResult.status === "fulfilled") {
        setOfferings(offeringsResult.value);
        setOfferingsError(null);
      } else {
        setOfferingsError(errorMessage(offeringsResult.reason, "Could not load your classes."));
      }

      if (timetableResult.status === "fulfilled") {
        setTimetable(timetableResult.value);
        setTimetableError(null);
      } else {
        setTimetableError(errorMessage(timetableResult.reason, "Could not load your timetable."));
      }

      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = todayName();
  const days = timetable?.days ?? {};
  const scheduledDays = DAY_ORDER.filter((day) => (days[day]?.length ?? 0) > 0);
  const todaysClasses = days[today] ?? [];

  return (
    <div className="space-y-6">
      <TeacherAnalytics />
      
      <ComponentCard
        title="Your classes"
        desc={user?.email ? `Signed in as ${user.email}` : undefined}
      >
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : offeringsError ? (
          <p className="text-sm text-error-500">{offeringsError}</p>
        ) : offerings.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No offerings are assigned to you yet. An admin assigns teachers when creating a
            course offering.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {offerings.map((offering) => (
              <Link
                key={offering.id}
                href={`/teacher/classes/${offering.id}`}
                className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium text-gray-800 dark:text-white/90">
                      {offering.course_code}
                    </h4>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {offering.course_title}
                    </p>
                  </div>
                  <Badge size="sm" color="info">
                    {offering.section}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  {offering.semester} · Capacity {offering.capacity}
                </p>
                <p className="mt-3 text-sm font-medium text-brand-500">Open class →</p>
              </Link>
            ))}
          </div>
        )}
      </ComponentCard>

      <ComponentCard
        title={`Today — ${today}`}
        desc={
          todaysClasses.length === 0
            ? "Nothing scheduled today."
            : `${todaysClasses.length} class(es) today`
        }
      >
        {timetableError ? (
          <p className="text-sm text-error-500">{timetableError}</p>
        ) : todaysClasses.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No classes on your timetable for today.
          </p>
        ) : (
          <div className="space-y-3">
            {todaysClasses.map((slot) => (
              <Link
                key={slot.schedule_id}
                href={`/teacher/classes/${slot.offering_id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4 transition hover:border-brand-300 dark:border-gray-800 dark:hover:border-brand-800"
              >
                <div>
                  <p className="font-medium text-gray-800 dark:text-white/90">
                    {slot.course_code} · Section {slot.section}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                    {slot.room ? ` · ${slot.room}` : ""}
                  </p>
                </div>
                <Badge size="sm" color="light">
                  {slot.enrolled_count}/{slot.capacity} enrolled
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </ComponentCard>

      <ComponentCard
        title="Weekly timetable"
        desc="Your teaching slots across the week, from GET /schedules/me."
      >
        {timetableError ? (
          <p className="text-sm text-error-500">{timetableError}</p>
        ) : scheduledDays.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No class times have been scheduled for your offerings yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {scheduledDays.map((day) => (
              <div
                key={day}
                className={`rounded-xl border p-4 ${
                  day === today
                    ? "border-brand-300 dark:border-brand-800"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <h5 className="mb-3 text-sm font-medium text-gray-800 dark:text-white/90">
                  {day}
                </h5>
                <div className="space-y-3">
                  {days[day].map((slot) => (
                    <div key={slot.schedule_id} className="text-sm">
                      <p className="text-gray-700 dark:text-gray-300">
                        {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {slot.course_code} · Section {slot.section}
                        {slot.room ? ` · ${slot.room}` : ""}
                      </p>
                      {slot.exceptions.length > 0 && (
                        <p className="mt-1 text-xs text-warning-500">
                          {slot.exceptions.length} exception(s) on record
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ComponentCard>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import MetricCard from "./MetricCard";
import API_ENDPOINTS from "@/config/api";
import { fetchCount } from "@/services/http";
import { listMyOfferings } from "@/services/teachingService";

export default function TeacherAnalytics() {
  const [counts, setCounts] = useState({
    offerings: 0,
    students: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const loadCounts = async () => {
      try {
        const offerings = await listMyOfferings();
        let totalEnrolled = 0;

        // Fetch counts for each offering to calculate total students
        await Promise.all(
          offerings.map(async (off) => {
            const count = await fetchCount(API_ENDPOINTS.ENROLLMENTS.BY_OFFERING(off.id));
            totalEnrolled += count;
          })
        );

        if (alive) {
          setCounts({ 
            offerings: offerings.length, 
            students: totalEnrolled 
          });
          setError(null);
        }
      } catch (err: any) {
        if (alive) {
          setError(err?.message || "Failed to load metrics");
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void loadCounts();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mb-8">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Your Overview
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          title="My Classes"
          value={counts.offerings}
          loading={loading}
          error={error}
        />
        <MetricCard
          title="Total Students"
          value={counts.students}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  );
}

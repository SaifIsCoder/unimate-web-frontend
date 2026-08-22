"use client";

import React, { useEffect, useState } from "react";
import MetricCard from "./MetricCard";
import API_ENDPOINTS from "@/config/api";
import { fetchCount } from "@/services/http";

export default function AdminAnalytics() {
  const [counts, setCounts] = useState({
    students: 0,
    teachers: 0,
    courses: 0,
    offerings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const loadCounts = async () => {
      try {
        const [students, teachers, courses, offerings] = await Promise.all([
          fetchCount(API_ENDPOINTS.STUDENTS.ROOT),
          fetchCount(API_ENDPOINTS.TEACHERS.ROOT),
          fetchCount(API_ENDPOINTS.COURSES.ROOT),
          fetchCount(API_ENDPOINTS.OFFERINGS.ROOT),
        ]);

        if (alive) {
          setCounts({ students, teachers, courses, offerings });
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
        Institution Overview
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Students"
          value={counts.students}
          loading={loading}
          error={error}
        />
        <MetricCard
          title="Total Teachers"
          value={counts.teachers}
          loading={loading}
          error={error}
        />
        <MetricCard
          title="Total Courses"
          value={counts.courses}
          loading={loading}
          error={error}
        />
        <MetricCard
          title="Active Offerings"
          value={counts.offerings}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  );
}

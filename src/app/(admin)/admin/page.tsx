"use client";

import Link from "next/link";
import ComponentCard from "@/components/common/ComponentCard";
import { useAuth } from "@/context/AuthContext";

type ModuleCard = {
  title: string;
  desc: string;
  href?: string;
};

const LIVE_MODULES: ModuleCard[] = [
  {
    title: "User Provisioning",
    desc: "Create student, teacher, and admin accounts. One form, one transactional endpoint.",
    href: "/admin/users",
  },
  {
    title: "Courses",
    desc: "Manage the course catalog and flag which courses carry a practical.",
    href: "/admin/courses",
  },
  {
    title: "Offerings",
    desc: "Create sections, assign teachers, and set the assessment weights that drive grading.",
    href: "/admin/offerings",
  },
  {
    title: "Enrollments",
    desc: "Assign students to an offering and manage the roster teachers grade against.",
    href: "/admin/enrollments",
  },
  {
    title: "Announcements",
    desc: "Broadcast to a department, a semester, or a specific set of offerings.",
    href: "/admin/announcements",
  },
  {
    title: "Events",
    desc: "Publish campus events to the mobile app calendar.",
    href: "/admin/events",
  },
];

const PLANNED_MODULES: ModuleCard[] = [
  { title: "Departments", desc: "Manage academic departments." },
  { title: "Schedules", desc: "Manage class timetables and exceptions." },
  { title: "Attendance", desc: "View attendance sessions and stats across any offering." },
  { title: "Grades", desc: "View gradebooks and full student transcripts." },
  { title: "Community", desc: "Moderate posts and comments within your department." },
];

function ModuleGrid({ modules }: { modules: ModuleCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((module) => {
        const body = (
          <>
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-800 dark:text-white/90">{module.title}</h4>
              {module.href ? (
                <span className="rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-600 dark:bg-success-500/15 dark:text-success-500">
                  Ready
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
                  Coming soon
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{module.desc}</p>
          </>
        );

        const className =
          "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]";

        return module.href ? (
          <Link
            key={module.title}
            href={module.href}
            className={`${className} transition hover:border-brand-300 hover:shadow-theme-xs dark:hover:border-brand-800`}
          >
            {body}
          </Link>
        ) : (
          <div key={module.title} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminHomePage() {
  const { user } = useAuth();
  const roleLabel = user?.role === "super_admin" ? "Super Admin" : "Admin";

  return (
    <div className="space-y-6">
      <ComponentCard
        title={`Welcome, ${roleLabel}`}
        desc={user?.email ? `Signed in as ${user.email}` : undefined}
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This is the Admin workspace. Data-entry modules are live below; the remaining
          read-and-moderate screens follow <code>DASHBOARD_PLAN.md</code>.
        </p>
      </ComponentCard>

      <div>
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Available now
        </h3>
        <ModuleGrid modules={LIVE_MODULES} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Planned
        </h3>
        <ModuleGrid modules={PLANNED_MODULES} />
      </div>
    </div>
  );
}

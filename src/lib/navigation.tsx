import React from "react";
import {
  BoxCubeIcon,
  CalenderIcon,
  GridIcon,
  GroupIcon,
  ListIcon,
  PaperPlaneIcon,
  UserCircleIcon,
} from "@/icons";
import { hasRole } from "./session";

/**
 * Navigation is data, not markup.
 *
 * One declaration drives the sidebar for every role, so adding a module in a
 * later phase is a single entry here rather than an edit in three components.
 *
 * Rule: only link routes that exist and talk to a real endpoint. Dead
 * placeholder links make a dashboard feel broken and hide what is genuinely
 * ready — planned modules are tracked in `dashboard_architecture_plan.md`, not
 * in the sidebar.
 */

export type NavLink = {
  name: string;
  path: string;
  /** Roles that may see this link. `super_admin` is implied wherever `admin` appears. */
  roles: readonly string[];
};

export type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  roles: readonly string[];
  subItems?: NavLink[];
};

export type NavSection = {
  /** Section heading; `null` renders the group with no label. */
  title: string | null;
  items: NavItem[];
};

const ADMIN = ["admin"] as const;
const TEACHER = ["teacher"] as const;
const ANY_STAFF = ["admin", "teacher"] as const;

const SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      { name: "Overview", icon: <GridIcon />, path: "/admin", roles: ADMIN },
      { name: "My Classes", icon: <GridIcon />, path: "/teacher", roles: TEACHER },
    ],
  },
  {
    title: "Academic",
    items: [
      {
        name: "Academic Setup",
        icon: <BoxCubeIcon />,
        roles: ADMIN,
        subItems: [
          { name: "Courses", path: "/admin/courses", roles: ADMIN },
          { name: "Offerings", path: "/admin/offerings", roles: ADMIN },
        ],
      },
      { name: "Enrollments", icon: <ListIcon />, path: "/admin/enrollments", roles: ADMIN },
    ],
  },
  {
    title: "People",
    items: [
      {
        name: "User Provisioning",
        icon: <GroupIcon />,
        path: "/admin/users",
        roles: ADMIN,
      },
    ],
  },
  {
    title: "Communications",
    items: [
      {
        name: "Announcements",
        icon: <PaperPlaneIcon />,
        path: "/admin/announcements",
        roles: ADMIN,
      },
      { name: "Events", icon: <CalenderIcon />, path: "/admin/events", roles: ADMIN },
    ],
  },
  {
    title: "Settings",
    items: [
      { name: "Account", icon: <UserCircleIcon />, path: "/account", roles: ANY_STAFF },
    ],
  },
];

/**
 * Sections visible to a role, with unauthorised items and sub-items removed.
 * Sections that end up empty are dropped so no orphan headings render.
 */
export const navigationForRole = (role: string | undefined): NavSection[] =>
  SECTIONS.map((section) => ({
    title: section.title,
    items: section.items
      .filter((item) => hasRole(role, item.roles))
      .map((item) => ({
        ...item,
        subItems: item.subItems?.filter((sub) => hasRole(role, sub.roles)),
      }))
      // An item whose sub-items were all filtered away has nothing to link to.
      .filter((item) => item.path || (item.subItems && item.subItems.length > 0)),
  })).filter((section) => section.items.length > 0);

import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import "flatpickr/dist/flatpickr.css";
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';

const outfit = Outfit({
  subsets: ["latin"],
});

/**
 * `title.template` applies to every descendant route that exports its own
 * `title`, so a page only declares its own name — "Courses" renders as
 * "Courses | UniMate Dashboard". `title.default` covers routes that declare
 * nothing, which previously left the tab showing the raw URL.
 *
 * `robots` is set because this is an authenticated internal tool; there is no
 * reason for any of it to be indexed.
 */
export const metadata: Metadata = {
  title: {
    default: "UniMate Dashboard",
    template: "%s | UniMate Dashboard",
  },
  description:
    "Administration and teaching workspace for the UniMate university management system.",
  applicationName: "UniMate Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Required by the nonce-based CSP set in `middleware.ts`.
 *
 * A nonce is unique per response, so it cannot exist in HTML generated at build
 * time. Left static, Next emits its inline bootstrap scripts with no nonce
 * attribute — and because the policy uses `strict-dynamic` (which makes
 * browsers ignore `'self'`), every one of those scripts is refused and the app
 * renders a blank page. Rendering per request lets Next read the nonce back off
 * the request header and stamp it onto its own scripts.
 *
 * The cost is nil here: every route is an authenticated client component that
 * fetches on mount, there is no anonymous traffic, and the app is explicitly
 * noindex. Nothing was gaining from prerendering.
 */
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <AuthProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

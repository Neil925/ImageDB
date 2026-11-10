import type { Metadata } from "next";
import Link from "next/link";
import { currentUser, hasRole } from "@/lib/authz";
import "./globals.css";

export const metadata: Metadata = {
  title: "ImageDB",
  description: "Private image board",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight text-sky-400">
              ImageDB
            </Link>
            <form action="/" method="get" className="flex min-w-52 flex-1 gap-2">
              <input
                type="search"
                name="tags"
                placeholder="search tags… e.g. blue_sky -generated rating:safe"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium hover:bg-sky-500"
              >
                Search
              </button>
            </form>
            <nav className="flex items-center gap-4 text-sm text-zinc-400">
              <Link href="/tags" className="hover:text-zinc-200">
                Tags
              </Link>
              <Link href="/pools" className="hover:text-zinc-200">
                Pools
              </Link>
              {user && (
                <Link href="/upload" className="font-medium text-sky-400 hover:text-sky-300">
                  + Upload
                </Link>
              )}
              {user && hasRole(user.role, "moderator") && (
                <Link href="/mod" className="hover:text-zinc-200">
                  Mod
                </Link>
              )}
              {user && (
                <Link href="/settings" className="hover:text-zinc-200">
                  Settings
                </Link>
              )}
              {user ? (
                <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                  {user.name || user.email} · {user.role}
                </span>
              ) : (
                <>
                  <Link href="/login" className="hover:text-zinc-200">
                    Sign in
                  </Link>
                  <Link href="/signup" className="font-medium text-sky-400 hover:text-sky-300">
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

import Link from "next/link";
import { Brand } from "@/components/Brand";
import type { Employee } from "@/lib/types";

export function TopBar({ employee }: { employee: Employee }) {
  const isAdmin = employee.role === "admin";
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-offwhite">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
        <Link href="/">
          <Brand />
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Documents
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Admin
            </Link>
          )}
          <div className="ml-2 hidden items-center gap-2 border-l border-gray-200 pl-3 sm:flex">
            <span className="text-sm text-gray-500">{employee.name}</span>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}

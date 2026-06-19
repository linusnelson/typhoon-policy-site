// Compact identity + sign-out. Server component; the sign-out uses the existing
// POST /auth/signout route. One unified shell means there's no portal to switch.
export function UserMenu({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="hidden px-2 text-sm text-gray-500 sm:inline">{name}</span>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-ink"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

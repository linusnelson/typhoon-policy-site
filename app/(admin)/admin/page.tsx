import { redirect } from "next/navigation";

// The dashboard is now the single role-adaptive landing at "/". Admins/managers
// land there too (with the operations section); this legacy route just forwards.
export default function AdminIndexPage() {
  redirect("/");
}

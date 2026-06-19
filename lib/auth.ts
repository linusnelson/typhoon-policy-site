import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/policies";
import type { Employee } from "@/lib/types";

export class AuthzError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthzError";
  }
}

// Server-side authorization guards for Server Actions / Route Handlers.
// Throwing keeps the action body from running; callers surface the message.

export async function requireEmployee(): Promise<Employee> {
  const employee = await getCurrentEmployee();
  if (!employee || employee.status !== "active") {
    throw new AuthzError("You must be signed in as an active employee.");
  }
  return employee;
}

export async function requireAdmin(): Promise<Employee> {
  const employee = await requireEmployee();
  if (employee.role !== "admin") {
    throw new AuthzError("Admin access required.");
  }
  return employee;
}

export async function requireAdminOrManager(): Promise<Employee> {
  const employee = await requireEmployee();
  if (employee.role !== "admin" && employee.role !== "manager") {
    throw new AuthzError("Admin or manager access required.");
  }
  return employee;
}

// Page guard for the manager team area (/team/*). Redirects (not throws) so it
// can be called at the top of a server-component page. Admins may view too.
export async function requireManagerView(): Promise<Employee> {
  const employee = await getCurrentEmployee();
  if (!employee || employee.status !== "active") redirect("/login");
  if (employee.role !== "manager" && employee.role !== "admin") redirect("/");
  return employee;
}

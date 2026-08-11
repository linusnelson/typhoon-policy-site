import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/policies";
import { istToday } from "@/lib/ist";
import type { Employee } from "@/lib/types";

// Active AND not past their relieving date (last working day — access runs
// through that day, cut from the next IST day). The daily cron also flips
// status → inactive, but checking here makes the cutoff immediate.
export function isAccessActive(employee: Employee): boolean {
  return (
    employee.status === "active" &&
    (!employee.relieving_date || employee.relieving_date >= istToday())
  );
}

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
  if (!employee || !isAccessActive(employee)) {
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
  if (!employee || !isAccessActive(employee)) redirect("/login");
  if (employee.role !== "manager" && employee.role !== "admin") redirect("/");
  return employee;
}

// Accounts users (employees.is_expense_approver) approve/reimburse expense
// claims. Admins always qualify as the fallback approver.
export async function requireExpenseApprover(): Promise<Employee> {
  const employee = await requireEmployee();
  if (employee.role !== "admin" && !employee.is_expense_approver) {
    throw new AuthzError("Expense approver access required.");
  }
  return employee;
}

// Page-guard variant for /expenses/approvals (lives OUTSIDE /admin because
// accounts users are usually not admins and the admin layout bounces them).
export async function requireExpenseApproverView(): Promise<Employee> {
  const employee = await getCurrentEmployee();
  if (!employee || !isAccessActive(employee)) redirect("/login");
  if (employee.role !== "admin" && !employee.is_expense_approver) redirect("/");
  return employee;
}

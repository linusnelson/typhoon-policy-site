import { createClient } from "@/lib/supabase/server";

// Full self-serve profile (read-only fields + the employee-editable phone).
// Mirrors the SalaryBox-style profile in clock_bays. RLS scopes to self.

export interface MyProfile {
  id: string;
  name: string;
  employeeCode: string | null;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  designation: string | null;
  department: string | null;
  location: string | null;
  shift: string | null;
  dateOfJoining: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export async function getMyProfile(employeeId: string): Promise<MyProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select(
      "id, name, employee_code, email, phone, photo_url, designation, date_of_joining, address, emergency_contact_name, emergency_contact_phone, departments(name), locations(name), shifts(name)"
    )
    .eq("id", employeeId)
    .maybeSingle();

  if (!data) return null;
  const d = data as unknown as {
    id: string;
    name: string;
    employee_code: string | null;
    email: string;
    phone: string | null;
    photo_url: string | null;
    designation: string | null;
    date_of_joining: string | null;
    address: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    departments: { name: string | null } | null;
    locations: { name: string | null } | null;
    shifts: { name: string | null } | null;
  };

  return {
    id: d.id,
    name: d.name,
    employeeCode: d.employee_code,
    email: d.email,
    phone: d.phone,
    photoUrl: d.photo_url,
    designation: d.designation,
    department: d.departments?.name ?? null,
    location: d.locations?.name ?? null,
    shift: d.shifts?.name ?? null,
    dateOfJoining: d.date_of_joining,
    address: d.address,
    emergencyContactName: d.emergency_contact_name,
    emergencyContactPhone: d.emergency_contact_phone,
  };
}

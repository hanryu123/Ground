"use server";

import { redirect } from "next/navigation";
import { signInDashboard } from "@/lib/adminDashboardAuth";

export type DashboardLoginState = { error: string | null };

export async function loginDashboard(_prev: DashboardLoginState, formData: FormData): Promise<DashboardLoginState> {
  const password = String(formData.get("password") ?? "");
  const key = String(formData.get("key") ?? "");
  if (!(await signInDashboard(password))) return { error: "비밀번호가 맞지 않아요." };
  redirect(`/admin/dashboard?key=${encodeURIComponent(key)}`);
}

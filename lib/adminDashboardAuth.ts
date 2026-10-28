import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * /admin/dashboard 비밀번호 잠금 — URL key 와 별개로 한 번 더 막는다.
 *  - 비밀번호는 Vercel 환경변수 ADMIN_DASHBOARD_PASSWORD (저장소가 공개라 코드에 두지 않는다)
 *  - 맞으면 비밀번호 해시를 httpOnly 쿠키로 12시간 들고 있는다
 *  - 환경변수가 없으면 아무도 못 들어온다 (열어 두지 않는다)
 */
export const DASHBOARD_COOKIE_NAME = "admin-dash";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function dashboardToken(password: string): string {
  const salt = process.env.ADMIN_SECRET ?? "ground-admin";
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isDashboardPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_DASHBOARD_PASSWORD);
}

export async function isDashboardAuthenticated(): Promise<boolean> {
  const password = process.env.ADMIN_DASHBOARD_PASSWORD;
  if (!password) return false;
  const token = (await cookies()).get(DASHBOARD_COOKIE_NAME)?.value;
  return Boolean(token && safeEqual(token, dashboardToken(password)));
}

/** 서버 액션 맨 앞에서 부른다 — 액션은 페이지 밖에서도 호출될 수 있어서 따로 막아야 한다 */
export async function requireDashboardAuth(): Promise<void> {
  if (!(await isDashboardAuthenticated())) throw new Error("unauthorized");
}

/** 비밀번호가 맞으면 쿠키를 굽고 true */
export async function signInDashboard(input: string): Promise<boolean> {
  const password = process.env.ADMIN_DASHBOARD_PASSWORD;
  if (!password || !input || !safeEqual(input, password)) return false;
  (await cookies()).set({
    name: DASHBOARD_COOKIE_NAME,
    value: dashboardToken(password),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return true;
}

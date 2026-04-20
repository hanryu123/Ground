import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "admin-token";

/**
 * 서버 컴포넌트 / API 라우트 공용 — 현 요청이 admin 으로 인증된 상태인지 확인.
 *
 *  ⚠ Next 15+ 에서 cookies() 는 Promise 를 반환한다.
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;

  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  return Boolean(token && token === expected);
}

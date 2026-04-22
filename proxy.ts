import { NextRequest, NextResponse } from "next/server";

/**
 * Admin API 게이트 — `/api/admin/*` 는 쿠키 검사 (Next.js 16+ `proxy` 규약).
 *
 *  - 쿠키 이름: admin-token
 *  - 값       : process.env.ADMIN_PASSWORD 와 정확히 일치
 *  - 예외     : /api/admin/auth 만 통과
 *
 * /admin 페이지는 서버 컴포넌트 cookies() 로 별도 가드.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/admin/") && !pathname.startsWith("/api/admin/auth")) {
    const token = req.cookies.get("admin-token")?.value;
    const expected = process.env.ADMIN_PASSWORD;

    if (!expected) {
      return NextResponse.json(
        { error: "ADMIN_PASSWORD not configured on the server" },
        { status: 500 }
      );
    }
    if (!token || token !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};

import { NextRequest, NextResponse } from "next/server";

/**
 * Admin 컨트롤 타워 게이트 ── /api/admin/* 호출은 모두 쿠키 검사.
 *
 *  - 쿠키 이름: admin-token
 *  - 값       : process.env.ADMIN_PASSWORD 와 정확히 일치해야 함
 *  - 예외     : /api/admin/auth (로그인/로그아웃 자체) 은 통과시켜야 한다.
 *
 * 페이지 라우트 /admin 자체는 서버 컴포넌트에서 cookies() 로 직접 가드한다
 * (그래야 SSR 단계에서 로그인 폼/대시보드 분기가 깔끔).
 */
export function middleware(req: NextRequest) {
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

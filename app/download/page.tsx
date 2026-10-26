import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import AndroidWaitlistForm from "@/components/download/AndroidWaitlistForm";

const displaySerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});

const APP_STORE_ID = "6776453107";
const APP_STORE_URL = `https://apps.apple.com/kr/app/id${APP_STORE_ID}`;
const CONTACT_EMAIL = "ground.admin@gmail.com";

export const metadata: Metadata = {
  title: "GROUND — 내 팀만을 위한 편파 야구 알림",
  description:
    "라인업부터 실시간 편파 중계, 하이라이트까지. 내 팀의 결정적 순간을 제일 먼저 알려드려요.",
  alternates: { canonical: "/download" },
  // iOS Safari 상단 스마트 앱 배너
  itunes: { appId: APP_STORE_ID },
  openGraph: {
    title: "GROUND — 내 팀만을 위한 편파 야구 알림",
    description: "라인업부터 실시간 편파 중계, 하이라이트까지. 내 팀의 결정적 순간을 제일 먼저 알려드려요.",
    images: [{ url: "/icons/app-icon-1024.png", width: 1024, height: 1024 }],
    siteName: "GROUND",
  },
};

type Platform = "ios" | "android" | "desktop";

function detectPlatform(userAgent: string): Platform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  // iPadOS 13+ 사파리는 데스크톱 UA 를 쓰지만 터치 정보가 없어 서버에선 구분 불가 → desktop 으로 둔다 (QR 대신 링크도 함께 노출)
  return "desktop";
}

const TEAM_LOGOS = [
  { name: "LG 트윈스", src: "/images/logos/Lg.png" },
  { name: "KT 위즈", src: "/images/logos/KT.svg" },
  { name: "SSG 랜더스", src: "/images/logos/SSG.svg" },
  { name: "NC 다이노스", src: "/images/logos/NC.svg" },
  { name: "두산 베어스", src: "/images/logos/Doosan.svg" },
  { name: "KIA 타이거즈", src: "/images/logos/Kia.svg" },
  { name: "삼성 라이온즈", src: "/images/logos/Samsung.svg" },
  { name: "롯데 자이언츠", src: "/images/logos/Lotte.svg" },
  { name: "한화 이글스", src: "/images/logos/Hanhwa.svg" },
  { name: "키움 히어로즈", src: "/images/logos/Kiwoom.svg" },
];

const MOMENTS = [
  {
    when: "경기 1시간 전",
    title: "우리 팀 시선으로만 보는 프리뷰",
    body: "선발 매치업, 최근 흐름, 오늘 꼭 봐야 할 장면까지. 중립은 없어요.",
    notif: { app: "GROUND", time: "1시간 전", title: "오늘 경기 프리뷰 도착", text: "선발 싸움부터 오늘 관전 포인트까지, 우리 팀 편에서 정리했어요." },
    accent: "#3B82F6",
  },
  {
    when: "경기 중",
    title: "득점 순간 실시간 편파 중계",
    body: "점수판만 보내지 않아요. 지금 이 점수가 왜 중요한지, 팬의 감정 그대로 전해요.",
    notif: { app: "GROUND", time: "지금", title: "[7회말] 이대호 역전 투런!", text: "판이 뒤집혔습니다. 오늘 이 장면 하나로 다 보상받네요 🔥" },
    accent: "#EF4444",
  },
  {
    when: "경기 후",
    title: "캐스터 한줄평과 하이라이트",
    body: "이긴 날은 더 길게 즐기고, 진 날은 위로받고. 하이라이트 영상도 바로 이어져요.",
    notif: { app: "GROUND", time: "방금", title: "[경기 종료] 5 vs 3 승", text: "불펜이 끝까지 버텼어요. 오늘 하이라이트 바로 보기 →" },
    accent: "#F59E0B",
  },
];

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" aria-hidden className={className} fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function AppStoreButton({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <a
      href={APP_STORE_URL}
      className={`inline-flex items-center gap-3 rounded-2xl bg-white text-black transition hover:bg-white/90 active:scale-[0.98] ${
        size === "lg" ? "px-6 py-4" : "px-5 py-3"
      }`}
    >
      <AppleIcon className={size === "lg" ? "h-7 w-7" : "h-6 w-6"} />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[11px] font-medium text-black/60">Download on the</span>
        <span className={`${size === "lg" ? "text-xl" : "text-lg"} font-semibold tracking-tight`}>App Store</span>
      </span>
    </a>
  );
}

function Notification({
  app,
  time,
  title,
  text,
  accent,
}: {
  app: string;
  time: string;
  title: string;
  text: string;
  accent: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.07] p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/45">
        <img src="/icons/icon-192x192.png" alt="" className="h-5 w-5 rounded-[6px]" />
        <span className="font-semibold">{app}</span>
        <span className="ml-auto normal-case tracking-normal">{time}</span>
      </div>
      <p className="text-[15px] font-semibold text-white">
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: accent }} />
        {title}
      </p>
      <p className="mt-1 text-[14px] leading-relaxed text-white/70">{text}</p>
    </div>
  );
}

function PhoneShot({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-[34px] border border-white/15 bg-black shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] ${className ?? ""}`}
    >
      <img src={src} alt={alt} className="block h-auto w-full" loading="eager" />
    </div>
  );
}

export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>;
}) {
  const [{ src }, headerList] = await Promise.all([searchParams, headers()]);
  const platform = detectPlatform(headerList.get("user-agent") ?? "");

  // PC 화면의 QR 을 아이폰으로 찍고 들어온 경우엔 바로 앱스토어로 보낸다.
  if (src === "qr" && platform === "ios") redirect(APP_STORE_URL);

  const isDesktop = platform === "desktop";

  return (
    <main className="document-shell fixed inset-0 overflow-y-auto overscroll-contain bg-[#07080a] text-white [-webkit-overflow-scrolling:touch]">
      {/* 배경 — 10개 구단 컬러가 아주 은은하게 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[720px] opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 10%, rgba(195,4,82,0.22), transparent 70%), radial-gradient(50% 45% at 85% 20%, rgba(7,76,161,0.25), transparent 70%), radial-gradient(40% 40% at 60% 60%, rgba(255,102,0,0.10), transparent 70%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* 상단 바 */}
        <header className="flex items-center justify-between py-5 sm:py-7">
          <div className="flex items-center gap-2.5">
            <img src="/icons/icon-192x192.png" alt="" className="h-9 w-9 rounded-[10px]" />
            <span className={`${displaySerif.className} text-2xl tracking-[0.18em]`}>GROUND</span>
          </div>
          {isDesktop ? (
            <a
              href={APP_STORE_URL}
              className="hidden rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 sm:inline-block"
            >
              App Store에서 보기
            </a>
          ) : null}
        </header>

        {/* 히어로 */}
        <section className="grid items-center gap-12 pb-16 pt-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-24 lg:pt-12">
          <div>
            <p className="mb-5 text-sm font-semibold tracking-[0.2em] text-white/50">KBO 팬덤 응원 앱</p>
            <h1 className="text-[40px] font-extrabold leading-[1.15] tracking-[-0.03em] sm:text-[56px]">
              내 팀을 위한
              <br />
              극단적 편파 알림
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/65">
              우리팀 라인업부터 실시간 중계, 하이라이트, 최근 뉴스까지.
              <br className="hidden sm:block" /> 경기 없는 날에도 우리 팀 이야기를 모아 드려요.
            </p>

            {/* 다운로드 — PC: QR / 모바일: 앱스토어 버튼 */}
            {isDesktop ? (
              <div className="mt-10 inline-flex items-center gap-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-5 pr-7">
                <div className="rounded-2xl bg-white p-2.5">
                  <img src="/landing/qr.png" alt="GROUND 앱 다운로드 QR 코드" className="h-36 w-36 [image-rendering:pixelated]" />
                </div>
                <div>
                  <p className="text-lg font-bold">아이폰 카메라로 찍어보세요</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/55">
                    바로 앱스토어 설치 화면으로 이동해요.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                    <a href={APP_STORE_URL} className="font-semibold text-white underline-offset-4 hover:underline">
                      App Store 링크로 열기 →
                    </a>
                  </div>
                  <div className="mt-3">
                    <AndroidWaitlistForm placement="hero_desktop" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-9 flex flex-col items-start gap-3">
                {platform === "android" ? (
                  <>
                    <p className="text-sm leading-relaxed text-white/50">
                      지금은 iPhone에서만 쓸 수 있어요. Android 버전은 열심히 만들고 있어요.
                    </p>
                    <AndroidWaitlistForm defaultOpen placement="hero_android" />
                  </>
                ) : (
                  <>
                    <AppStoreButton size="lg" />
                    <AndroidWaitlistForm placement="hero_ios" />
                  </>
                )}
              </div>
            )}
          </div>

          {/* 폰 스크린샷 3장 */}
          <div className="relative mx-auto flex w-full max-w-[520px] items-end justify-center">
            <PhoneShot
              src="/landing/postgame.jpg"
              alt="경기 후 캐스터 한줄평 화면"
              className="relative z-0 w-[36%] -translate-y-2 translate-x-6 -rotate-[7deg] opacity-90"
            />
            <PhoneShot
              src="/landing/today.jpg"
              alt="오늘 경기 화면"
              className="relative z-10 w-[42%] -translate-y-6"
            />
            <PhoneShot
              src="/landing/schedule.jpg"
              alt="경기 일정 화면"
              className="relative z-0 w-[36%] -translate-x-6 -translate-y-2 rotate-[7deg] opacity-90"
            />
          </div>
        </section>

        {/* 경기 하루 흐름 */}
        <section className="border-t border-white/10 py-16 lg:py-24">
          <h2 className="text-[28px] font-extrabold tracking-[-0.02em] sm:text-4xl">경기 날, 이렇게 울려요</h2>
          <p className="mt-3 text-white/55">경기 전부터 끝난 뒤까지, 우리 팀 이야기만.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {MOMENTS.map((m) => (
              <article key={m.when} className="flex flex-col rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
                <span className="text-xs font-bold tracking-[0.18em]" style={{ color: m.accent }}>
                  {m.when}
                </span>
                <h3 className="mt-3 text-xl font-bold leading-snug">{m.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-white/60">{m.body}</p>
                <div className="mt-auto pt-6">
                  <Notification {...m.notif} accent={m.accent} />
                </div>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm text-white/45">
            잠금화면 라이브 스코어도 지원해요. 앱을 열지 않아도 점수가 바로 보여요.
          </p>
        </section>

        {/* 경기 없는 날에도 — 피드·일정·순위 */}
        <section className="border-t border-white/10 py-16 lg:py-24">
          <span className="text-xs font-bold tracking-[0.18em] text-[#22C55E]">NEW</span>
          <h2 className="mt-3 text-[28px] font-extrabold tracking-[-0.02em] sm:text-4xl">경기 없는 날에도, 비시즌에도</h2>
          <p className="mt-3 text-white/55">앱을 열면 오늘 우리 팀 숏츠와 소식이 먼저 기다려요.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {/* 숏츠 */}
            <article className="flex flex-col rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <h3 className="text-xl font-bold leading-snug">우리 팀 숏츠, 피드에서 바로</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/60">
                구단 공식 채널과 KBO·티빙 숏츠 중 우리 팀 것만 골라서 보여 드려요. 스크롤하면 바로 재생돼요.
              </p>
              <div className="mt-auto flex gap-2.5 pt-6" aria-hidden>
                {["#C30452", "#074CA1", "#FF6600"].map((c, i) => (
                  <div
                    key={c}
                    className="relative aspect-[9/16] flex-1 overflow-hidden rounded-2xl border border-white/10"
                    style={{ background: `linear-gradient(160deg, ${c}55, #0b0c0f 75%)` }}
                  >
                    {i === 0 ? (
                      <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 pl-0.5 text-[13px] text-black">
                        ▶
                      </span>
                    ) : null}
                    <span className="absolute inset-x-2 bottom-2 h-1.5 rounded-full bg-white/25" />
                  </div>
                ))}
              </div>
            </article>

            {/* 소식 */}
            <article className="flex flex-col rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <h3 className="text-xl font-bold leading-snug">FA·트레이드, 우리 팀 소식 가득</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/60">
                야구 기사 중 우리 팀 이야기만 골라요. 같은 소식은 하나로 묶고, FA·트레이드 같은 큰 소식은 위로 올려요.
              </p>
              <ul className="mt-auto space-y-3 pt-6" aria-hidden>
                {[
                  { tag: "FA", w: "w-[88%]" },
                  { tag: "트레이드", w: "w-[72%]" },
                  { tag: "외국인", w: "w-[80%]" },
                ].map((n) => (
                  <li key={n.tag} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3">
                    <div className="min-w-0 flex-1">
                      <span className="inline-block rounded-full bg-[#E0283E] px-2 py-[1px] text-[11px] font-bold">
                        {n.tag}
                      </span>
                      <span className={`mt-2 block h-2 rounded-full bg-white/30 ${n.w}`} />
                      <span className="mt-1.5 block h-2 w-1/2 rounded-full bg-white/15" />
                    </div>
                    <span className="h-11 w-11 shrink-0 rounded-xl bg-white/10" />
                  </li>
                ))}
              </ul>
            </article>

            {/* 일정·순위 */}
            <article className="flex flex-col rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
              <h3 className="text-xl font-bold leading-snug">일정·순위도 한눈에</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/60">
                주간 달력에서 날짜를 고르면 그날 경기만, 순위표에선 가을야구 대진표까지 바로 보여요.
              </p>
              <div className="mt-auto pt-6" aria-hidden>
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-white/40">
                  {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                  {[18, 19, 20, 21, 22, 23, 24].map((d) => (
                    <span key={d} className="flex flex-col items-center gap-1 pt-1.5">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${
                          d === 21 ? "bg-white text-black" : "text-white/80"
                        }`}
                      >
                        {d}
                      </span>
                      <span className={`h-1 w-1 rounded-full ${d % 2 === 0 ? "bg-[#E0283E]" : "bg-transparent"}`} />
                    </span>
                  ))}
                </div>
                <div className="mt-4 space-y-1.5">
                  {[1, 2, 3].map((r) => (
                    <div
                      key={r}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[12px] ${
                        r === 2 ? "bg-[#E0283E]/80" : "bg-white/[0.05]"
                      }`}
                    >
                      <span className="w-3 font-bold text-white/70">{r}</span>
                      <span className="h-2 flex-1 rounded-full bg-white/25" />
                      <span className="font-semibold tabular-nums text-white/70">.{650 - r * 30}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* 10개 구단 */}
        <section className="border-t border-white/10 py-16 lg:py-20">
          <h2 className="text-[28px] font-extrabold tracking-[-0.02em] sm:text-4xl">10개 구단 팬 모두, 각자의 팀을 위해!</h2>
          <p className="mt-3 text-white/55">응원팀을 고르면 그 팀 컬러와 말투로 앱 전체가 바뀌어요.</p>
          <ul className="mt-10 grid grid-cols-5 gap-4 sm:gap-6 md:grid-cols-10">
            {TEAM_LOGOS.map((t) => (
              <li key={t.name} className="flex aspect-square items-center justify-center rounded-2xl bg-white/[0.05] p-3">
                <img src={t.src} alt={t.name} title={t.name} className="max-h-full max-w-full object-contain" />
              </li>
            ))}
          </ul>
        </section>

        {/* 하단 CTA */}
        <section className="border-t border-white/10 py-16 text-center lg:py-20">
          <h2 className="text-[28px] font-extrabold tracking-[-0.02em] sm:text-4xl">오늘 경기부터 같이 봐요</h2>
          <div className="mt-8 flex flex-col items-center gap-4">
            {isDesktop ? (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="rounded-2xl bg-white p-2">
                  <img src="/landing/qr.png" alt="GROUND 앱 다운로드 QR 코드" className="h-28 w-28 [image-rendering:pixelated]" />
                </div>
                <div className="flex flex-col items-center gap-3 sm:items-start">
                  <AppStoreButton />
                  <AndroidWaitlistForm placement="footer_desktop" />
                </div>
              </div>
            ) : (
              platform === "android" ? (
                <AndroidWaitlistForm defaultOpen align="center" placement="footer_android" />
              ) : (
                <>
                  <AppStoreButton size="lg" />
                  <AndroidWaitlistForm align="center" placement="footer_ios" />
                </>
              )
            )}
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-white/10 py-8 text-sm text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 GROUND</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-white/70">
              개인정보 처리방침
            </Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white/70">
              문의
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}

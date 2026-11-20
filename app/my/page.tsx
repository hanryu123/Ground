"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { TEAMS } from "@/lib/teams";
import { setMyTeam, useMyTeam } from "@/lib/useMyTeam";
import LogoImage from "@/components/LogoImage";
import LiveActivityRecoveryButton from "@/components/LiveActivityRecoveryButton";
import { getClubTheme } from "@/lib/clubTheme";
import {
  CASTER_STYLES,
  CASTER_STYLE_STORAGE_KEY,
  casterStyleSample,
  parseCasterStyle,
  type CasterStyle,
} from "@/lib/notifications/casterStyle";
import { getOrCreateNotifyUserId, saveCasterStyle } from "@/lib/webPushClient";

const CONTACT_EMAIL = "ground.admin@gmail.com";
const FEEDBACK_MAIL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[GROUND 피드백] 야구 찐팬의 한마디")}&body=${encodeURIComponent(
  "기기명 (예: iPhone 15 Pro): \n응원 구단: \n\n불편하셨던 점이나 GROUND 팀에게 바라는 점을 자유롭게 적어주세요!"
)}`;
const DELETE_MAIL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[GROUND] 데이터 삭제 요청")}&body=${encodeURIComponent(
  "안녕하세요,\n\nGROUND 앱에 저장된 제 데이터(푸시 토큰, 기기 ID) 삭제를 요청합니다.\n\n앱 버전: \n요청 사유 (선택): "
)}`;

/** iOS 그룹 목록 — 제목은 목록 위 작은 회색 글씨, 설명은 목록 아래 */
function Group({
  title,
  footer,
  id,
  children,
}: {
  title?: string;
  footer?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-7 scroll-mt-4">
      {title ? <h2 className="mb-1.5 px-9 text-[13px] text-sys-label2">{title}</h2> : null}
      <div className="mx-4 overflow-hidden rounded-[12px] bg-sys-card">{children}</div>
      {footer ? <p className="mt-1.5 px-9 text-[13px] leading-snug text-sys-label2">{footer}</p> : null}
    </section>
  );
}

function Divider({ inset = 16 }: { inset?: number }) {
  return <div className="h-[0.5px] bg-sys-sep" style={{ marginLeft: inset }} />;
}

export default function MyPage() {
  const team = useMyTeam();
  const club = getClubTheme(team.id);

  return (
    <section className="pb-nav flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-sys-bg [-webkit-overflow-scrolling:touch]">
      <header className="safe-pt px-5 pb-2">
        <h1 className="text-[34px] font-bold leading-[1.15] tracking-[-0.02em]">MY</h1>
      </header>

      {/* 응원팀 카드 — 이 화면의 유일한 구단 색 면 */}
      <div className="mx-4 mt-2 flex items-center gap-4 rounded-[18px] bg-club-field px-[18px] py-4 text-club-on">
        <span className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full bg-white">
          <LogoImage teamId={team.id} alt="" size={38} fallbackText={team.shortEn} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[26px] font-black leading-tight tracking-[-0.03em]">{team.name}</span>
          <span className="block text-[13px] opacity-85">{team.city}</span>
        </span>
      </div>

      <CasterStylePicker teamId={team.id} />

      <Group title="잠금 화면" footer="경기 중 잠금 화면 실시간 점수가 꺼졌을 때 다시 켜요. iPhone 앱에서만 돼요.">
        <LiveActivityRecoveryButton teamId={team.id} teamShort={team.short} accent={club.tintLight} variant="settings" />
      </Group>

      <Group title="응원팀 바꾸기" footer="한 팀만 고를 수 있어요. 바꾸면 알림도 새 팀 기준으로 와요.">
        {TEAMS.map((t, i) => {
          const active = t.id === team.id;
          return (
            <div key={t.id}>
              {i > 0 ? <Divider inset={60} /> : null}
              <button
                type="button"
                onClick={() => setMyTeam(t.id)}
                aria-pressed={active}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left active:bg-sys-fill"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-[0.5px] ring-black/10">
                  <LogoImage teamId={t.id} alt="" size={22} fallbackText={t.shortEn} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[17px] ${active ? "font-bold" : ""}`}>{t.name}</span>
                </span>
                {active ? <Check size={20} strokeWidth={2.6} className="shrink-0 text-club-tint" aria-hidden /> : null}
              </button>
            </div>
          );
        })}
      </Group>

      <Group title="정보">
        <a href={FEEDBACK_MAIL} className="flex min-h-[48px] items-center justify-between px-4 text-[17px] active:bg-sys-fill">
          의견 보내기
          <ChevronRight size={18} className="text-sys-label3" aria-hidden />
        </a>
        <Divider />
        <Link href="/privacy" className="flex min-h-[48px] items-center justify-between px-4 text-[17px] active:bg-sys-fill">
          개인정보처리방침
          <ChevronRight size={18} className="text-sys-label3" aria-hidden />
        </Link>
        <Divider />
        <a href={DELETE_MAIL} className="flex min-h-[48px] items-center justify-between px-4 text-[17px] text-[#D70015] active:bg-sys-fill dark:text-[#FF453A]">
          데이터 삭제 요청
        </a>
      </Group>
      <div className="h-6" />
    </section>
  );
}

/** 득점 알림 말투 — 알림 링크 /my#caster-style 로 바로 들어온다 */
function CasterStylePicker({ teamId }: { teamId: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 저장된 말투를 읽기 전엔 체크 표시를 그리지 않는다 — 기본값으로 먼저 그렸다 바뀌는 깜빡임 방지
  const [style, setStyle] = useState<CasterStyle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CASTER_STYLE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setStyle(parseCasterStyle(saved));
    // 알림 링크로 들어오면 이 칸으로
    if (window.location.hash !== "#caster-style") return;
    const timer = window.setTimeout(() => ref.current?.scrollIntoView({ block: "start" }), 300);
    return () => window.clearTimeout(timer);
  }, []);

  const choose = async (next: CasterStyle) => {
    if (!style || next === style) return;
    const previous = style;
    setStyle(next);
    setError(null);
    try {
      await saveCasterStyle(next, getOrCreateNotifyUserId());
    } catch {
      setStyle(previous);
      setError("저장하지 못했어요. 잠시 후 다시 눌러 주세요.");
    }
  };

  return (
    <div ref={ref}>
      <Group id="caster-style" title="득점 알림 말투" footer={error ?? "점수가 나면 고른 말투로 알림이 와요."}>
        {CASTER_STYLES.map((s, i) => {
          const active = style === s.id;
          return (
            <div key={s.id}>
              {i > 0 ? <Divider /> : null}
              <button
                type="button"
                onClick={() => void choose(s.id)}
                aria-pressed={active}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-sys-fill"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block text-[17px] ${active ? "font-bold" : ""}`}>{s.label}</span>
                  <span className="mt-0.5 block break-keep text-[13px] leading-snug text-sys-label2">
                    {casterStyleSample(s.id, teamId)}
                  </span>
                </span>
                <span className="w-5 shrink-0">
                  {active ? <Check size={20} strokeWidth={2.6} className="text-club-tint" aria-hidden /> : null}
                </span>
              </button>
            </div>
          );
        })}
      </Group>
    </div>
  );
}

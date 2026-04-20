"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Crosshair, Play, Trophy, Check, X } from "lucide-react";

/**
 * NotificationBell — 우상단 알림 종.
 *
 *  - 좌상단 LogoImage(48px)와 시각적 균형: 44px 터치 타겟, 22px 얇은 stroke.
 *  - 클릭 시 글래스모피즘 패널이 펼쳐지며 3단계 구독 토글 노출.
 *      1) 선발 투수 확정/업데이트
 *      2) 경기 시작 직전
 *      3) 경기 종료 후 최종 스코어/하이라이트
 *  - 첫 토글 ON 시 Notification 권한 요청 (이미 granted/denied면 스킵).
 *  - 구독 상태는 localStorage에 영속, 패널 닫혀도 우상단 dot으로 표시.
 *  - 외부 클릭/ESC로 닫힘.
 *
 * 실제 푸시 송신은 별도 서버 인프라(Web Push / FCM 등)에서 처리. 본 컴포넌트는
 * "유저 의향 수집 + 브라우저 권한 게이트" 역할만 담당한다.
 */

const STORAGE_KEY = "ground-notif-prefs";

type NotifPrefs = {
  pitcher: boolean;
  preGame: boolean;
  postGame: boolean;
};

const DEFAULT_PREFS: NotifPrefs = {
  pitcher: false,
  preGame: false,
  postGame: false,
};

const ITEMS: Array<{
  key: keyof NotifPrefs;
  label: string;
  hint: string;
  Icon: typeof Bell;
}> = [
  {
    key: "pitcher",
    label: "선발 투수 업데이트",
    hint: "라인업이 확정되면 바로 알려드릴게요.",
    Icon: Crosshair,
  },
  {
    key: "preGame",
    label: "경기 시작 직전",
    hint: "플레이볼 15분 전 푸시.",
    Icon: Play,
  },
  {
    key: "postGame",
    label: "경기 종료 · 하이라이트",
    hint: "최종 스코어와 주요 장면 요약.",
    Icon: Trophy,
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

type Props = {
  /** 활성 dot / 토글 ON 색상 (응원 팀 accent) */
  accent: string;
};

export default function NotificationBell({ accent }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");

  // ── 초기 로드: prefs + 현재 권한 상태 ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
        setPrefs({ ...DEFAULT_PREFS, ...parsed });
      }
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // ── prefs 영속 ──
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  // ── 외부 클릭 / ESC 로 닫기 ──
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const anyOn = prefs.pitcher || prefs.preGame || prefs.postGame;

  async function toggle(key: keyof NotifPrefs) {
    const turningOn = !prefs[key];
    // 첫 토글 ON 이고 권한이 default면 → 브라우저 권한 요청
    if (
      turningOn &&
      permission === "default" &&
      typeof window !== "undefined" &&
      "Notification" in window
    ) {
      try {
        const result = await Notification.requestPermission();
        setPermission(result);
      } catch {
        /* ignore */
      }
    }
    setPrefs((p) => ({ ...p, [key]: turningOn }));
  }

  return (
    <div ref={wrapRef} className="absolute right-5 top-5 z-30">
      {/* ── 종 트리거 ── */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full"
        aria-label="알림 설정"
        aria-expanded={open}
      >
        <Bell
          size={21}
          strokeWidth={1.5}
          className="text-white/85"
          style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.55))" }}
        />
        {anyOn && (
          <motion.span
            layoutId="notif-dot"
            className="absolute"
            style={{
              top: 8,
              right: 8,
              width: 7,
              height: 7,
              borderRadius: 9999,
              backgroundColor: accent,
              boxShadow: `0 0 8px ${accent}aa, 0 0 0 1.5px rgba(0,0,0,0.55)`,
            }}
          />
        )}
      </motion.button>

      {/* ── 패널 ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.22, ease }}
            className="absolute right-0 top-12 w-[284px] overflow-hidden rounded-2xl"
            style={{
              backgroundColor: "rgba(15,15,18,0.78)",
              backdropFilter: "blur(24px) saturate(160%)",
              WebkitBackdropFilter: "blur(24px) saturate(160%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 12px 36px rgba(0,0,0,0.55)",
            }}
            role="dialog"
            aria-label="알림 구독 설정"
          >
            {/* 헤더 */}
            <div className="flex items-start justify-between px-4 pb-1.5 pt-3.5">
              <div>
                <p
                  className="text-[9.5px] uppercase tracking-[0.32em] text-white/40"
                  style={{ fontWeight: 600 }}
                >
                  Notifications
                </p>
                <p className="mt-1 text-[12px] leading-snug text-white/60">
                  {permission === "denied"
                    ? "브라우저 알림이 차단돼 있어요. 설정에서 허용해주세요."
                    : "받아볼 알림을 골라주세요."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
                aria-label="닫기"
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>

            {/* 항목 */}
            <div className="px-2 pb-2 pt-1">
              {ITEMS.map(({ key, label, hint, Icon }) => {
                const on = prefs[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                    aria-pressed={on}
                  >
                    <span
                      className="mt-[2px] flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                      style={{
                        backgroundColor: on
                          ? `${accent}24`
                          : "rgba(255,255,255,0.05)",
                        color: on ? accent : "rgba(255,255,255,0.55)",
                      }}
                    >
                      <Icon size={14} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-[13px] leading-tight text-white/92"
                        style={{ fontWeight: 600 }}
                      >
                        {label}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-white/45">
                        {hint}
                      </span>
                    </span>
                    {/* iOS-style toggle */}
                    <span
                      className="mt-1 inline-flex h-[20px] w-[34px] shrink-0 items-center rounded-full px-[2px] transition-colors"
                      style={{
                        backgroundColor: on
                          ? accent
                          : "rgba(255,255,255,0.16)",
                      }}
                    >
                      <motion.span
                        animate={{ x: on ? 14 : 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 480,
                          damping: 32,
                        }}
                        className="block h-[16px] w-[16px] rounded-full bg-white"
                        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.35)" }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 풋터 상태 */}
            <div
              className="border-t px-4 py-2.5 text-[10px] uppercase tracking-[0.22em]"
              style={{
                fontWeight: 500,
                borderColor: "rgba(255,255,255,0.06)",
                color: anyOn ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
              }}
            >
              {anyOn ? (
                <span className="flex items-center gap-1.5">
                  <Check size={11} strokeWidth={2.2} style={{ color: accent }} />
                  구독 중
                </span>
              ) : (
                "Off"
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronRight, Smartphone } from "lucide-react";
import { TEAMS } from "@/lib/teams";
import LogoImage from "@/components/LogoImage";
import { setMyTeam, ONBOARDING_DONE_KEY } from "@/lib/useMyTeam";
import { getClubTheme } from "@/lib/clubTheme";
import { usePwaInstallGate } from "@/lib/usePwaInstallGate";
import {
  getOrCreateNotifyUserId,
  persistSubscription,
  registerServiceWorker,
  subscribeBrowserPush,
  type PushTopics,
} from "@/lib/webPushClient";
import {
  CASTER_STYLES,
  CASTER_STYLE_STORAGE_KEY,
  casterStyleSample,
  type CasterStyle,
} from "@/lib/notifications/casterStyle";

const ease = [0.22, 1, 0.36, 1] as const;

const DEFAULT_TOPICS: PushTopics = {
  pitcher: true,
  preGame: true,
  postGame: true,
  highlight: true,
  score: true,
  livePitcherChange: true,
  liveStrikeout: true,
  liveHomeRun: true,
};
const NOTIF_PREFS_STORAGE_KEY = "ground-notif-prefs";


type Props = {
  onComplete: () => void;
};

function ShareGuideIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mx-0.5 inline-block align-[-2px]"
      aria-hidden
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function AddHomeGuideIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mx-0.5 inline-block align-[-2px]"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

export default function OnboardingFlow({ onComplete }: Props) {
  // 1 응원팀 → 2 알림 말투 → 3 알림 켜기
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [casterStyle, setCasterStyle] = useState<CasterStyle>("analyst");
  const [installGuide, setInstallGuide] = useState<"none" | "ios" | "android">("none");
  const [isNativeApp, setIsNativeApp] = useState(false);
  const { isStandalone, os, canPromptInstall, promptInstall } = usePwaInstallGate();

  useEffect(() => {
    // Capacitor 네이티브 앱 여부 감지
    import("@capacitor/core")
      .then(({ Capacitor }) => setIsNativeApp(Capacitor.isNativePlatform()))
      .catch(() => setIsNativeApp(false));
  }, []);

  async function fetchVapidKey(): Promise<string | null> {
    try {
      const res = await fetch("/api/notifications/subscribe", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { vapidPublicKey?: unknown };
      return typeof data.vapidPublicKey === "string" && data.vapidPublicKey.trim().length > 0
        ? data.vapidPublicKey
        : null;
    } catch {
      return null;
    }
  }

  const selectedTeam = useMemo(
    () => (selectedTeamId ? TEAMS.find((t) => t.id === selectedTeamId) ?? null : null),
    [selectedTeamId]
  );
  const club = getClubTheme(selectedTeamId);

  useEffect(() => {
    void fetchVapidKey().then((key) => {
      if (key) setVapidPublicKey(key);
    });
  }, []);

  function chooseTeam(teamId: string) {
    setMyTeam(teamId);
    setSelectedTeamId(teamId);
    setStep(2);
    setErrorMsg(null);
  }

  function chooseCasterStyle(style: CasterStyle) {
    try {
      // 구독 등록 때 topics 에 실려 서버로 간다 (withStoredCasterStyle) — 웰컴 알림도 이 말투로 나간다
      localStorage.setItem(CASTER_STYLE_STORAGE_KEY, style);
    } catch {
      /* ignore */
    }
    setCasterStyle(style);
    setStep(3);
    setErrorMsg(null);
  }

  function goBackToTeamSelect() {
    setStep(1);
    setErrorMsg(null);
  }

  function goBackToStyleSelect() {
    setStep(2);
    setErrorMsg(null);
  }

  async function completeOnboarding() {
    if (!selectedTeamId) {
      setErrorMsg("먼저 응원팀을 선택해 주세요.");
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    try {
      // 네이티브 앱: PWA 설치 안내 불필요, 웹 푸시 대신 FCM 사용 (OnboardingGate에서 등록)
      if (isNativeApp) {
        localStorage.setItem(ONBOARDING_DONE_KEY, "1");
        onComplete();
        return;
      }

      if (!isStandalone) {
        if (os === "android") {
          const result = await promptInstall();
          if (result === "unavailable") setInstallGuide("android");
          return;
        }
        if (os === "ios") {
          setInstallGuide("ios");
          return;
        }
        setInstallGuide("android");
        return;
      }

      if (!("Notification" in window)) {
        setErrorMsg("이 환경에서는 알림 권한을 지원하지 않아요.");
        return;
      }
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== "granted") {
        setErrorMsg("푸시 알림 권한을 허용해야 시작할 수 있어요.");
        return;
      }
      const resolvedVapidKey = vapidPublicKey ?? (await fetchVapidKey());
      if (!resolvedVapidKey) {
        setErrorMsg("알림 설정 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (!vapidPublicKey) setVapidPublicKey(resolvedVapidKey);

      const reg = await registerServiceWorker();
      if (!reg) {
        setErrorMsg("서비스 워커를 지원하지 않는 브라우저예요.");
        return;
      }
      const sub = await subscribeBrowserPush(reg, resolvedVapidKey);
      const uid = getOrCreateNotifyUserId();
      await persistSubscription(sub, DEFAULT_TOPICS, uid);
      localStorage.setItem(NOTIF_PREFS_STORAGE_KEY, JSON.stringify(DEFAULT_TOPICS));
      localStorage.setItem(ONBOARDING_DONE_KEY, "1");
      onComplete();
    } catch (error) {
      console.error("[onboarding] push setup failed", error);
      setErrorMsg("알림 설정 중 오류가 발생했어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  const onField = club.onField;
  // 구단 색 면 위 큰 버튼 — 글자색과 면 색을 맞바꿔 쓴다 (한화처럼 글자가 어두운 팀도 대비 유지)
  const ctaBg = onField;
  const ctaText = club.field;

  return (
    <div
      className="relative h-dvh overflow-hidden"
      style={step === 1 ? undefined : { backgroundColor: club.field, color: onField }}
    >
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div
            key="onboarding-step-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className="flex h-full flex-col bg-sys-bg text-label"
          >
            <div className="safe-pt px-5 pb-4">
              <h1 className="text-[34px] font-bold leading-[1.15] tracking-[-0.02em]">응원팀을 골라 주세요</h1>
              <p className="mt-1 text-[15px] text-sys-label2">고른 팀 편에서만 알림을 보내 드려요.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-10">
              <ul className="mx-4 overflow-hidden rounded-[12px] bg-sys-card">
                {TEAMS.map((team, i) => (
                  <li key={team.id}>
                    {i > 0 ? <div className="ml-[68px] h-[0.5px] bg-sys-sep" /> : null}
                    <button
                      type="button"
                      onClick={() => chooseTeam(team.id)}
                      className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left active:bg-sys-fill"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ring-[0.5px] ring-black/10">
                        <LogoImage teamId={team.id} alt="" size={28} fallbackText={team.shortEn} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] font-semibold">{team.name}</span>
                        <span className="block text-[13px] text-sys-label2">{team.city}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ) : step === 2 ? (
          <motion.div
            key="onboarding-step-style"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease }}
            className="flex h-full flex-col"
          >
            <div className="safe-pt px-5 pb-4">
              <button
                type="button"
                onClick={goBackToTeamSelect}
                className="-ml-2 mb-2 inline-flex h-11 w-11 items-center justify-center rounded-full active:opacity-60"
                aria-label="팀 다시 고르기"
              >
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-[34px] font-bold leading-[1.15] tracking-[-0.02em]">누가 알려드릴까요?</h1>
              <p className="mt-1 text-[15px] opacity-85">
                {selectedTeam?.short ?? "우리 팀"} 점수가 나면 이 말투로 알림이 와요. MY에서 언제든 바꿀 수 있어요.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-10">
              <ul className="mx-4 overflow-hidden rounded-[12px] bg-white text-[#1C1C1E]">
                {CASTER_STYLES.map((style, i) => (
                  <li key={style.id}>
                    {i > 0 ? <div className="ml-4 h-[0.5px] bg-black/15" /> : null}
                    <button
                      type="button"
                      onClick={() => chooseCasterStyle(style.id)}
                      className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-black/5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] font-semibold">{style.label}</span>
                        <span className="mt-0.5 block break-keep text-[13px] leading-snug text-[#3C3C43]/70">
                          {casterStyleSample(style.id, selectedTeamId)}
                        </span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-black/25" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="onboarding-step-notify"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease }}
            className="flex h-full flex-col"
          >
            <div className="safe-pt px-5">
              <button
                type="button"
                onClick={goBackToStyleSelect}
                className="-ml-2 mb-2 inline-flex h-11 w-11 items-center justify-center rounded-full active:opacity-60"
                aria-label="말투 다시 고르기"
              >
                <ArrowLeft size={22} />
              </button>
              <h1 className="break-keep text-[30px] font-bold leading-[1.2] tracking-[-0.02em]">
                {selectedTeam?.short ?? "우리 팀"} 점수가 나면
                <br />
                이렇게 알려드려요
              </h1>
            </div>

            {/* 잠금 화면 알림 미리보기 — 고른 말투 그대로 */}
            <div className="mt-8 space-y-2 px-4">
              {[
                { title: `[7회말] ${selectedTeam?.short ?? "우리 팀"} 역전`, body: casterStyleSample(casterStyle, selectedTeamId), when: "지금" },
                { title: `${selectedTeam?.short ?? "우리 팀"} 선발 라인업 발표`, body: "오늘 라인업이 나왔어요. 눌러서 확인해 보세요.", when: "1시간 전" },
              ].map((n, i) => (
                <motion.div
                  key={n.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease, delay: 0.12 + i * 0.1 }}
                  className={`rounded-[20px] bg-white/90 px-3.5 py-3 text-[#1C1C1E] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] ${i === 1 ? "scale-[0.97] opacity-80" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/icon-192x192.png" alt="" className="h-5 w-5 rounded-[5px]" />
                    <span className="text-[13px] font-semibold tracking-[0.02em] text-[#3C3C43]/70">GROUND</span>
                    <span className="ml-auto text-[13px] text-[#3C3C43]/60">{n.when}</span>
                  </div>
                  <p className="mt-1 text-[15px] font-semibold">{n.title}</p>
                  <p className="break-keep text-[15px] leading-snug">{n.body}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-auto px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
              <p className="mb-4 break-keep text-center text-[13px] opacity-85">
                나는 타 팀 스파이가 아니며, 오직 {selectedTeam?.name ?? "우리 팀"}의 우승만을 바랍니다.
              </p>
              {errorMsg ? (
                <p className="mb-3 rounded-[10px] bg-black/25 px-3 py-2 text-center text-[13px] font-semibold">{errorMsg}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void completeOnboarding()}
                disabled={loading}
                className="min-h-[52px] w-full rounded-[14px] px-4 text-[17px] font-bold transition active:scale-[0.98] disabled:opacity-60"
                style={{ backgroundColor: ctaBg, color: ctaText }}
              >
                {loading ? "켜는 중…" : "편파 알림 켜기"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {installGuide !== "none" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-black/40"
          >
            <motion.div
              initial={{ y: 30, opacity: 0.96 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0.96 }}
              transition={{ duration: 0.24, ease }}
              className="absolute inset-x-4 bottom-6 mx-auto max-w-md rounded-[14px] bg-sys-card p-5 text-label"
            >
              <p className="text-[16px] font-semibold leading-snug">
                GROUND를 쓰려면 홈 화면에 추가해야 해요
              </p>
              {installGuide === "ios" ? (
                <div
                  className="mt-4 space-y-2 text-[15px] leading-relaxed text-label/85"
                >
                  <p>
                    #1. 사파리 하단 <ShareGuideIcon />
                    <span className="font-semibold">공유</span> 버튼을 선택하세요.
                  </p>
                  <p className="text-sys-label2">
                    (공유 버튼이 안 보인다면, 주소창 옆 ... 버튼을 선택하면 나와요!)
                  </p>
                  <p>
                    #2. 메뉴를 스크롤하여 <AddHomeGuideIcon />
                    <span className="font-semibold">홈 화면에 추가</span>를 선택하세요.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-2 text-[15px] text-label/85">
                  <p className="flex items-center gap-2">
                    <Smartphone size={15} />
                    {canPromptInstall
                      ? "설치 팝업이 닫혔다면 다시 설치를 진행해 주세요."
                      : "우측 상단 메뉴(⋮)에서 [홈 화면에 추가]를 눌러 설치해 주세요."}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={() => setInstallGuide("none")}
                className="mt-5 min-h-[48px] w-full rounded-[12px] bg-sys-fill px-4 text-[17px] font-semibold text-club-tint active:opacity-60"
              >
                다음에 할게요
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

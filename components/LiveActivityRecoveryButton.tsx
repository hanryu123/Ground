"use client";

import { useMemo, useState } from "react";
import { Activity, ChevronRight, Loader2, Settings } from "lucide-react";
import {
  getLiveActivityAvailability,
  openLiveActivitySettings,
} from "@/lib/liveActivity";
import { recoverLiveActivityForTeam } from "@/lib/liveActivityRecovery";
import { getKboTeamThemeByTeamId } from "@/config/teams";

type Props = {
  teamId: string;
  teamShort: string;
  accent: string;
  variant?: "hero" | "settings";
};

type StatusTone = "idle" | "ok" | "warn" | "error";

type Status = {
  tone: StatusTone;
  text: string;
};

function statusClass(tone: StatusTone): string {
  if (tone === "ok") return "text-emerald-200";
  if (tone === "warn") return "text-amber-200";
  if (tone === "error") return "text-red-200";
  return "text-white/55";
}

function recoveryMessage(action: string, reason?: string): Status {
  if (action === "started") {
    return { tone: "ok", text: "잠금화면 라이브 스코어를 다시 켰어요." };
  }
  if (action === "ended") {
    return { tone: "ok", text: "오늘 경기가 끝나 종료 상태로 정리했어요." };
  }
  if (reason === "no_payload") {
    return { tone: "warn", text: "오늘 이 팀의 진행 중인 경기가 아직 없어요." };
  }
  if (reason === "ios_only") {
    return { tone: "warn", text: "이 기능은 iPhone 앱에서 사용할 수 있어요." };
  }
  return { tone: "warn", text: "지금은 다시 켤 경기가 없어요." };
}

export default function LiveActivityRecoveryButton({
  teamId,
  teamShort,
  accent,
  variant = "hero",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({
    tone: "idle",
    text: "잠금화면 위젯이 꺼졌을 때 즉시 복구합니다.",
  });
  const theme = getKboTeamThemeByTeamId(teamId);
  const resolvedAccent = theme?.secondary ?? accent;

  const containerClass = useMemo(() => {
    if (variant === "settings") {
      return "rounded-[24px] border border-white/[0.08] bg-black/25 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]";
    }
    return "rounded-[22px] border border-white/[0.12] bg-black/36 p-3 shadow-[0_14px_42px_rgba(0,0,0,0.34)] backdrop-blur-xl";
  }, [variant]);

  async function handleRecover() {
    if (busy) return;
    setBusy(true);
    try {
      const availability = await getLiveActivityAvailability();
      if (!availability.available) {
        const shouldOpenSettings = window.confirm(
          "아이폰 알림 설정에서 '실시간 현황' 권한을 허용해주세요.\n\n설정 화면으로 이동할까요?"
        );
        if (shouldOpenSettings) {
          await openLiveActivitySettings();
        }
        setStatus({
          tone: "warn",
          text: "설정에서 알림과 실시간 현황을 허용한 뒤 다시 눌러주세요.",
        });
        return;
      }

      const result = await recoverLiveActivityForTeam(teamId, { force: true });
      setStatus(recoveryMessage(result.action, result.reason));
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "복구 중 오류가 발생했어요.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={containerClass}>
      <button
        type="button"
        onClick={handleRecover}
        disabled={busy}
        className="group flex w-full items-center gap-3 text-left transition active:scale-[0.99] disabled:opacity-70"
        aria-label="오늘 경기 라이브 스코어 다시 켜기"
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: `${resolvedAccent}26`,
            boxShadow: `0 0 22px ${resolvedAccent}44`,
            color: "#ffffff",
          }}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Activity size={18} />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-black tracking-tight text-white">
            오늘 경기 라이브 스코어 다시 켜기
          </span>
          <span className={`mt-1 block text-[11px] font-semibold ${statusClass(status.tone)}`}>
            {teamShort} · {status.text}
          </span>
        </span>

        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/80 transition group-active:bg-white/[0.14]"
          aria-hidden
        >
          {status.tone === "warn" ? <Settings size={15} /> : <ChevronRight size={16} />}
        </span>
      </button>
    </div>
  );
}

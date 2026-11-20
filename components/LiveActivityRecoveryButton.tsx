"use client";

import { useState } from "react";
import { Activity, ChevronRight, Loader2, Settings } from "lucide-react";
import {
  getLiveActivityAvailability,
  openLiveActivitySettings,
} from "@/lib/liveActivity";
import { recoverLiveActivityForTeam } from "@/lib/liveActivityRecovery";

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
  if (tone === "ok") return "text-[#248A3D] dark:text-[#30D158]";
  if (tone === "warn") return "text-[#B25000] dark:text-[#FF9F0A]";
  if (tone === "error") return "text-[#D70015] dark:text-[#FF453A]";
  return "text-sys-label2";
}

function recoveryMessage(action: string, reason?: string): Status {
  if (action === "started") {
    return { tone: "ok", text: "잠금화면 라이브 스코어를 다시 켰어요." };
  }
  if (action === "ended") {
    return {
      tone: "warn",
      text: "경기가 종료되었습니다. 실시간 스코어는 다음 경기 시작 시 잠금 화면에 자동으로 표시됩니다!",
    };
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
    text: "꺼졌을 때 다시 연결합니다.",
  });
  // 두 변형 모두 iOS 그룹 목록의 한 줄 — 아이콘 칸만 구단 색
  void accent;
  void variant;

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
    <div className="overflow-hidden rounded-[12px] bg-sys-card">
      <button
        type="button"
        onClick={handleRecover}
        disabled={busy}
        className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-sys-fill disabled:opacity-70"
        aria-label="잠금 화면에서도 스코어 보기"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-club-field text-club-on">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] leading-tight">잠금 화면에서도 스코어 보기</span>
          <span className={`mt-0.5 block text-[13px] ${statusClass(status.tone)}`}>
            {teamShort} · {status.text}
          </span>
        </span>
        {status.tone === "warn" ? (
          <Settings size={17} className="shrink-0 text-sys-label3" aria-hidden />
        ) : (
          <ChevronRight size={18} className="shrink-0 text-sys-label3" aria-hidden />
        )}
      </button>
    </div>
  );
}

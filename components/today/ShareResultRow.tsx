"use client";

import { useState } from "react";
import { ChevronRight, Loader2, Share } from "lucide-react";
import { findTeam, type Team } from "@/lib/teams";
import { POSTSEASON_ROUND_LABEL, getPostseasonRound, type LiveGame } from "@/lib/kbo";
import { venueDisplayLines } from "@/lib/venue";

/**
 * 경기가 끝나면 — 승/패 도장이 찍힌 결과 티켓을 스토리 크기 이미지로 만들어 공유한다.
 * 이미지는 /api/share/ticket 이 그린다. 공유 시트가 파일을 못 받으면 이미지 주소를, 그것도 안 되면 새 창으로 연다.
 */
export default function ShareResultRow({ team, game }: { team: Team; game: LiveGame }) {
  const [busy, setBusy] = useState(false);
  if (game.status !== "RESULT" || !game.result) return null;

  const isHome = game.homeId === team.id;
  const oppId = isHome ? game.awayId : game.homeId;
  const my = isHome ? game.result.homeScore : game.result.awayScore;
  const op = isHome ? game.result.awayScore : game.result.homeScore;
  const round = getPostseasonRound(game.id);
  const [, m, d] = game.date.split("-").map(Number);
  const params = new URLSearchParams({
    team: team.id,
    opp: oppId,
    my: String(my),
    op: String(op),
    round: round ? POSTSEASON_ROUND_LABEL[round] : "정규시즌",
    date: `${m}월 ${d}일`,
    venue: venueDisplayLines(game.stadium).primary,
  });
  const path = `/api/share/ticket?${params}`;
  const caption = `${team.short} ${my} : ${op} ${findTeam(oppId).short} — GROUND`;

  async function share() {
    if (busy) return;
    setBusy(true);
    const url = new URL(path, window.location.origin).toString();
    try {
      const blob = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`share image ${r.status}`);
        return r.blob();
      });
      const file = new File([blob], `ground-${team.id}-${game.date}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: caption });
      } else if (navigator.share) {
        await navigator.share({ url, title: caption });
      } else {
        window.open(url, "_blank");
      }
    } catch (err) {
      // 사용자가 공유 시트를 닫은 경우(AbortError)는 조용히 넘긴다
      if (!(err instanceof DOMException && err.name === "AbortError")) window.open(url, "_blank");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-sys-fill"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-club-field text-club-on">
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Share size={15} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] leading-tight">결과 티켓 공유하기</span>
        <span className="mt-0.5 block truncate text-[13px] text-sys-label2">스토리 크기 이미지로 만들어요</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-sys-label3" aria-hidden />
    </button>
  );
}

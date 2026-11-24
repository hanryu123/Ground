"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Play } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import LiveActivityRecoveryButton from "@/components/LiveActivityRecoveryButton";
import GamePass from "@/components/today/GamePass";
import { NextGamePass, SeasonPass } from "@/components/today/SeasonPass";
import ShareResultRow from "@/components/today/ShareResultRow";
import ScoringTimeline from "@/components/today/ScoringTimeline";
import FeedNewsSection from "@/components/feed/FeedNewsSection";
import FeedShortsSection from "@/components/feed/FeedShortsSection";
import FeedTicketPracticeCard from "@/components/feed/FeedTicketPracticeCard";
import { getFeedTheme } from "@/components/feed/feedTheme";
import { getClubTheme } from "@/lib/clubTheme";
import { findTeam } from "@/lib/teams";
import { getTeamGame, type LineupItem, type LiveGame } from "@/lib/kbo";
import type { MonthGamesPayload } from "@/lib/schedule";
import { useKboToday } from "@/lib/useKboToday";
import { useStandings } from "@/lib/useStandings";
import { useSeasonPhase } from "@/lib/season";
import { useMyTeam } from "@/lib/useMyTeam";

/**
 * /today — 오늘 탭.
 *   큰 제목 → 오늘 경기 티켓(GamePass) → 프리뷰/리포트·라인업·하이라이트 → 예매 연습·숏츠·소식.
 *   경기가 없는 날은 티켓 대신 다음 경기(또는 시즌 마감) 패스를 낮게 보여 준다.
 */

const KO_DOW = ["일", "월", "화", "수", "목", "금", "토"];

function kstDateLabel(ms: number): string {
  const d = new Date(ms + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${KO_DOW[d.getUTCDay()]}요일`;
}


function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** 경기 없는 날 — 이번 달·다음 달 일정에서 우리 팀 다음 경기 */
function useNextGame(teamId: string, enabled: boolean, today: string | null): LiveGame | null {
  const [next, setNext] = useState<LiveGame | null>(null);
  useEffect(() => {
    if (!enabled || !today) return;
    let alive = true;
    const [y, m] = today.split("-").map(Number);
    const months = [`${y}-${String(m).padStart(2, "0")}`, m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`];
    void (async () => {
      for (const month of months) {
        try {
          const r = await fetch(`/api/kbo/games?month=${month}`);
          if (!r.ok) continue;
          const data = (await r.json()) as MonthGamesPayload;
          const found = data.games.find(
            (g) => g.date > today && (g.homeId === teamId || g.awayId === teamId) && g.status !== "CANCEL"
          );
          if (found) {
            if (alive) setNext(found);
            return;
          }
        } catch {
          // 다음 경기를 못 찾으면 그냥 안 보여 준다
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [teamId, enabled, today]);
  return next;
}

function GroupedRow({
  title,
  detail,
  onClick,
  href,
  leading,
}: {
  title: string;
  detail?: string | null;
  onClick?: () => void;
  href?: string;
  leading?: React.ReactNode;
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] leading-tight">{title}</span>
        {detail ? <span className="mt-0.5 block truncate text-[13px] text-sys-label2">{detail}</span> : null}
      </span>
      <ChevronRight size={18} className="shrink-0 text-sys-label3" aria-hidden />
    </>
  );
  const cls = "flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-sys-fill";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

function Lineups({ mine, theirs, oppShort }: { mine: LineupItem[]; theirs: LineupItem[] | null; oppShort: string }) {
  const Col = ({ title, items }: { title: string; items: LineupItem[] }) => (
    <div className="min-w-0">
      <p className="mb-1.5 text-[13px] font-semibold text-sys-label2">{title}</p>
      <ol className="space-y-1">
        {items.map((p) => (
          <li key={`${p.order}-${p.name}`} className="flex items-baseline gap-2 text-[15px]">
            <span className="w-4 font-num text-[15px] font-semibold text-club-tint">{p.order}</span>
            <span className="truncate font-semibold">{p.name}</span>
            <span className="truncate text-[12px] text-sys-label2">{p.position}</span>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-4 px-4 py-3">
      <Col title="우리 팀" items={mine} />
      {theirs ? <Col title={oppShort} items={theirs} /> : null}
    </div>
  );
}

export default function TodayPage() {
  const team = useMyTeam();
  const club = getClubTheme(team.id);
  const { postseason, offseason } = useSeasonPhase(team.id);
  const feedTheme = useMemo(() => getFeedTheme(team), [team]);
  const live = useKboToday(team.id, { withStandings: false });
  const { data: standings } = useStandings();
  const now = useNow(30_000);
  const view = live ? getTeamGame(live.games, team.id) : null;
  const game = view?.game ?? null;
  const next = useNextGame(team.id, Boolean(live) && !game && !offseason, live?.date ?? null);
  const [detailOpen, setDetailOpen] = useState(false);

  const preview = live?.pregamePreview?.active && live.pregamePreview.status === "READY" ? live.pregamePreview : null;
  const report = live?.postGameReport?.active && live.postGameReport.status === "READY" ? live.postGameReport : null;
  const highlight = live?.highlightVideo ?? null;
  const myLineup = game ? (view?.side === "home" ? game.homeLineup : game.awayLineup) : null;
  const oppLineup = game ? (view?.side === "home" ? game.awayLineup : game.homeLineup) : null;

  return (
    <div className="pb-nav relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-sys-bg [-webkit-overflow-scrolling:touch]">
      <header className="safe-pt flex items-end justify-between px-5 pb-3">
        <div>
          <p className="text-[13px] font-semibold text-sys-label2">{kstDateLabel(now)}</p>
          <h1 className="text-[34px] font-bold leading-[1.15] tracking-[-0.02em]">오늘</h1>
        </div>
        <div className="-mr-2 mb-0.5 text-label">
          <NotificationBell accent={club.tintLight} iconColor="currentColor" />
        </div>
      </header>

      {game ? (
        <GamePass team={team} game={game} standings={standings} nowMs={now} onOpenDetail={() => setDetailOpen((v) => !v)} />
      ) : live ? (
        offseason ? <SeasonPass team={team} standings={standings} /> : <NextGamePass team={team} next={next} />
      ) : (
        <div className="mx-4 h-[300px] animate-pulse rounded-[18px] bg-sys-card" aria-label="오늘 경기 불러오는 중" />
      )}

      {/* 경기 관련 — 프리뷰·리포트는 모달 대신 바로 읽히게 펼쳐 둔다 */}
      {preview || report ? (
        <section className="mx-4 mt-6 rounded-[12px] bg-sys-card px-4 py-3.5">
          <h2 className="text-[17px] font-bold leading-snug">{report ? report.headline : preview?.title}</h2>
          <div className="mt-1.5 space-y-1 text-[15px] leading-[1.55] text-label/80">
            {report ? <p>{report.content}</p> : preview?.lines.map((line) => <p key={line}>{line}</p>)}
          </div>
        </section>
      ) : null}

      {game ? <ScoringTimeline team={team} game={game} /> : null}

      {game && (highlight || myLineup || game.status === "RESULT") ? (
        <section className="mx-4 mt-4 overflow-hidden rounded-[12px] bg-sys-card">
          {game.status === "RESULT" ? <ShareResultRow team={team} game={game} /> : null}
          {highlight ? (
            <div className={game.status === "RESULT" ? "border-t-[0.5px] border-sys-sep" : ""}>
            <GroupedRow
              title="하이라이트 보기"
              detail="유튜브에서 열려요"
              href={highlight.url}
              leading={
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-club-field text-club-on">
                  <Play size={15} fill="currentColor" aria-hidden />
                </span>
              }
            />
            </div>
          ) : null}
          {myLineup ? (
            <div className={highlight || game.status === "RESULT" ? "border-t-[0.5px] border-sys-sep" : ""}>
              <button
                type="button"
                onClick={() => setDetailOpen((v) => !v)}
                aria-expanded={detailOpen}
                className="flex min-h-[52px] w-full items-center justify-between px-4 text-left text-[17px] active:bg-sys-fill"
              >
                선발 라인업
                <ChevronRight
                  size={18}
                  className={`text-sys-label3 transition-transform ${detailOpen ? "rotate-90" : ""}`}
                  aria-hidden
                />
              </button>
              {detailOpen ? <Lineups mine={myLineup} theirs={oppLineup} oppShort={findTeam(view!.opponentId).short} /> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 잠금 화면 실시간 점수 다시 켜기 — 오늘 경기가 있을 때만 (평소엔 MY 에 있다) */}
      {game && game.status !== "RESULT" && game.status !== "CANCEL" ? (
        <div className="mx-4 mt-4">
          <LiveActivityRecoveryButton teamId={team.id} teamShort={team.short} accent={club.tintLight} variant="settings" />
        </div>
      ) : null}

      {postseason ? <FeedTicketPracticeCard theme={feedTheme} /> : null}
      <FeedShortsSection team={team} theme={feedTheme} />
      <FeedNewsSection team={team} theme={feedTheme} />
    </div>
  );
}

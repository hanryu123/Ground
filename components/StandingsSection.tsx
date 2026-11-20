"use client";

import { findTeam } from "@/lib/teams";
import TeamLogoChip from "@/components/TeamLogoChip";
import { formatWinRate, formatGamesBehind } from "@/config/standings";
import type { RecentRecord, StandingsTableRow } from "@/lib/standings";

/**
 * StandingsSection — /rank 순위표. NBA 앱 순위표처럼 촘촘한 표 한 장.
 *
 *  ── 레이아웃 ──
 *   순위 · 팀 두 칸은 sticky 로 왼쪽에 고정, 나머지 숫자 칸은 가로 스크롤.
 *   sticky 칸은 아래로 지나가는 숫자를 가려야 하므로 배경을 불투명하게 칠한다.
 *
 *  ── 강조 ──
 *   - 우리 팀 행: 구단 색 면(--club-field, lib/clubTheme.ts)
 *   - 5위 아래: 가을야구 컷라인 점선
 */

/** 표는 iOS 카드 위 — 우리 팀 행만 구단 색 면(티켓과 같은 --club-field)으로 칠한다 */
const BG = "var(--sys-card)";
const LINE = "var(--sep)";
const CUT_LINE = "1px dashed rgb(var(--label-rgb) / 0.35)";
const POSTSEASON_SLOTS = 5;

const RANK_W = 24;
const TEAM_W = 70;

type Props = {
  /** 응원팀 id — 행 하이라이트 */
  myTeamId: string;
  rows?: StandingsTableRow[];
  /** true 면 스켈레톤 */
  loading?: boolean;
};

type Column = {
  key: string;
  label: string;
  width: number;
  render: (row: StandingsTableRow, isMe: boolean) => React.ReactNode;
};

const COLUMNS: Column[] = [
  { key: "wins", label: "승", width: 32, render: (r) => r.wins },
  { key: "losses", label: "패", width: 32, render: (r) => r.losses },
  { key: "winRate", label: "승률", width: 44, render: (r) => formatWinRate(r.winRate) },
  { key: "gb", label: "게임차", width: 42, render: (r) => formatGamesBehind(r.gamesBehind) },
  { key: "streak", label: "연속", width: 38, render: (r, isMe) => <StreakCell label={r.streakLabel} plain={isMe} /> },
  { key: "draws", label: "무", width: 30, render: (r) => r.draws },
  { key: "games", label: "경기", width: 40, render: (r) => r.games },
  { key: "last10", label: "최근 10경기", width: 104, render: (r) => formatRecent(r.last10) },
];

function formatRecent(rec: RecentRecord | null): string {
  if (!rec) return "—";
  return rec.draws > 0
    ? `${rec.wins}승 ${rec.draws}무 ${rec.losses}패`
    : `${rec.wins}승 ${rec.losses}패`;
}

export default function StandingsSection({ myTeamId, rows, loading }: Props) {
  const data = rows ?? [];
  const showSkeleton = loading || data.length === 0;

  return (
    <section aria-label="KBO 순위표" className="mx-4 overflow-hidden rounded-[12px]" style={{ backgroundColor: BG }}>
      <div className="relative">
      {/* 오른쪽에 경기·최근 10경기 칸이 더 있다는 표시 */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-30 w-6" style={{ background: `linear-gradient(90deg, transparent, ${BG})` }} />
      <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <table
          className="w-full border-separate border-spacing-0 text-label"
          style={{ minWidth: RANK_W + TEAM_W + COLUMNS.reduce((s, c) => s + c.width, 0) + 16 }}
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 pl-4 text-left"
                style={{ ...headStyle, width: RANK_W + 16, backgroundColor: BG }}
              >
                #
              </th>
              <th
                scope="col"
                className="sticky z-20 text-left"
                style={{ ...headStyle, left: RANK_W + 16, width: TEAM_W, backgroundColor: BG, boxShadow: stickyEdge }}
              >
                팀
              </th>
              {COLUMNS.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={i === COLUMNS.length - 1 ? "pr-4 text-right" : "text-right"}
                  style={{ ...headStyle, width: c.width }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showSkeleton
              ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} index={i} />)
              : data.map((row, i) => (
                  <Row
                    key={row.teamId}
                    row={row}
                    isMe={row.teamId === myTeamId}
                    isCut={i === POSTSEASON_SLOTS - 1 && data.length > POSTSEASON_SLOTS}
                  />
                ))}
          </tbody>
        </table>
      </div>
      </div>

      {!showSkeleton && (
        <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-sys-label2">
          <span aria-hidden className="inline-block w-5" style={{ borderTop: CUT_LINE }} />
          <span>점선 위 {POSTSEASON_SLOTS}팀이 가을야구에 나가요</span>
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────

const headStyle: React.CSSProperties = {
  height: 32,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--label-2)",
  whiteSpace: "nowrap",
  borderBottom: `1px solid ${LINE}`,
};

/** 고정 칸 오른쪽에 얇은 선 — 스크롤된 숫자와 경계 */
const stickyEdge = `inset -1px 0 0 ${LINE}`;

function Row({
  row,
  isMe,
  isCut,
}: {
  row: StandingsTableRow;
  isMe: boolean;
  isCut: boolean;
}) {
  const t = findTeam(row.teamId);
  const bg = isMe ? "var(--club-field)" : BG;
  const cell: React.CSSProperties = {
    height: 44,
    borderBottom: isCut ? CUT_LINE : `1px solid ${LINE}`,
    backgroundColor: isMe ? bg : undefined,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  };
  const num = isMe ? "var(--club-on-field)" : "rgb(var(--label-rgb) / 0.85)";

  return (
    <tr aria-current={isMe ? "true" : undefined}>
      <td
        className="sticky left-0 z-10 pl-4 text-left font-num"
        style={{
          ...cell,
          backgroundColor: bg,
          fontSize: 16,
          fontWeight: 600,
          color: isMe ? "var(--club-on-field)" : "var(--label-2)",
        }}
      >
        {row.rank}
      </td>
      <th
        scope="row"
        className="sticky z-10 text-left"
        style={{ ...cell, left: RANK_W + 16, backgroundColor: bg, boxShadow: stickyEdge }}
      >
        <span className="flex items-center gap-2">
          <TeamLogoChip teamId={row.teamId} />
          <span
            className="truncate"
            style={{ fontSize: 15, fontWeight: isMe ? 900 : 700, letterSpacing: "-0.02em", color: isMe ? "var(--club-on-field)" : "rgb(var(--label-rgb))" }}
          >
            {t.short}
          </span>
        </span>
      </th>
      {COLUMNS.map((c, i) => (
        <td
          key={c.key}
          className={i === COLUMNS.length - 1 ? "pr-4 text-right font-num" : "text-right font-num"}
          style={{
            ...cell,
            fontSize: 16,
            fontWeight: isMe || c.key === "winRate" ? 700 : 500,
            color: c.key === "draws" && row.draws === 0 && !isMe ? "rgb(var(--label-rgb) / 0.4)" : num,
          }}
        >
          {c.render(row, isMe)}
        </td>
      ))}
    </tr>
  );
}

/** plain: 팀 컬러 배경 위라 초록·빨강 대신 흰색 */
function StreakCell({ label, plain }: { label: string | null; plain?: boolean }) {
  if (!label) return <span className="text-label/40">—</span>;
  const kind = label[0];
  const color = plain
    ? "var(--club-on-field)"
    : kind === "W"
      ? "var(--win)"
      : kind === "L"
        ? "var(--loss)"
        : "rgb(var(--label-rgb) / 0.6)";
  return <span style={{ color, fontWeight: 700 }}>{label}</span>;
}

// ──────────────────────────────────────────────────────────────────

function SkeletonRow({ index }: { index: number }) {
  const cell: React.CSSProperties = { height: 44, borderBottom: `1px solid ${LINE}` };
  return (
    <tr aria-hidden>
      <td className="sticky left-0 z-10 pl-4" style={{ ...cell, backgroundColor: BG }}>
        <ShimmerBar w={10} h={10} />
      </td>
      <td className="sticky z-10" style={{ ...cell, left: RANK_W + 16, backgroundColor: BG, boxShadow: stickyEdge }}>
        <ShimmerBar w={40 + ((index * 7) % 24)} h={12} />
      </td>
      {COLUMNS.map((c, i) => (
        <td key={c.key} className={i === COLUMNS.length - 1 ? "pr-4" : undefined} style={cell}>
          <ShimmerBar w={Math.min(c.width - 12, 28)} h={10} className="ml-auto" />
        </td>
      ))}
    </tr>
  );
}

function ShimmerBar({ w, h, className = "" }: { w: number; h: number; className?: string }) {
  return (
    <span
      className={`block rounded ${className}`}
      style={{
        width: w,
        height: h,
        background:
          "linear-gradient(90deg, rgb(var(--label-rgb) / 0.04) 0%, rgb(var(--label-rgb) / 0.10) 50%, rgb(var(--label-rgb) / 0.04) 100%)",
        backgroundSize: "200% 100%",
        animation: "ground-shimmer 1.6s linear infinite",
      }}
    />
  );
}

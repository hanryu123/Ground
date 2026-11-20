"use client";

import LogoImage from "@/components/LogoImage";
import { findTeam, type Team } from "@/lib/teams";
import type { LiveGame } from "@/lib/kbo";
import type { StandingsPayload } from "@/lib/standings";
import { Perforation, Stamp, Stub, seasonSerial } from "@/components/today/GamePass";

/**
 * 경기가 없는 날의 티켓 — GamePass 와 같은 몸체(구단 색 면 · 절취선 · 반쪽)를 쓴다.
 *  - 비시즌: 시즌권. 반쪽에 올 시즌 성적, 도장은 최종 순위(우승이면 "우승").
 *  - 시즌 중 쉬는 날: 다음 경기 티켓. 반쪽에 날짜와 시작 시간.
 */

const KO_DOW = ["일", "월", "화", "수", "목", "금", "토"];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const dow = KO_DOW[new Date(`${iso}T12:00:00+09:00`).getUTCDay()];
  return `${m}/${d} (${dow})`;
}

function TeamHead({ team, line }: { team: Team; line: string }) {
  return (
    <div className="flex items-center gap-4 px-[18px] pb-4 pt-4">
      <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-white">
        <LogoImage teamId={team.id} alt="" size={36} fallbackText={team.shortEn} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[26px] font-black leading-tight tracking-[-0.03em]">{team.name}</span>
        <span className="block text-[13px] font-semibold opacity-85">{line}</span>
      </span>
    </div>
  );
}

export function SeasonPass({ team, standings }: { team: Team; standings: StandingsPayload | null }) {
  const row = standings?.standings.find((r) => r.teamId === team.id) ?? null;
  const champion = standings?.bracket?.championId === team.id;
  const serial = seasonSerial(team.id, standings, true);
  return (
    <div className="relative mx-4 text-club-on" aria-label={`${team.short} ${standings?.season ?? ""} 시즌 기록`}>
      <div className="rounded-t-[18px] bg-club-field">
        <div className="flex items-center justify-between px-[18px] pt-[14px] text-[12px] font-semibold tracking-[0.04em] opacity-90">
          <span>{standings?.season ?? ""} 시즌 마감</span>
          {serial ? <span className="font-num text-[15px] font-semibold tracking-[0.02em]">{serial}</span> : null}
        </div>
        <TeamHead team={team} line="올해도 끝까지 함께해서 고마워요" />
      </div>
      <Perforation />
      <Stub torn>
        {row ? (
          <div className="flex items-baseline gap-1 font-bold leading-none">
            <span className="font-num text-[34px]">{row.wins}</span>
            <span className="text-[15px]">승</span>
            <span className="ml-1.5 font-num text-[34px]">{row.losses}</span>
            <span className="text-[15px]">패</span>
            {row.draws ? (
              <>
                <span className="ml-1.5 font-num text-[34px]">{row.draws}</span>
                <span className="text-[15px]">무</span>
              </>
            ) : null}
          </div>
        ) : (
          <span className="text-[17px] font-bold">시즌 기록 불러오는 중</span>
        )}
        {champion ? <Stamp label="우승" /> : row ? <Stamp label={`${row.rank}위`} /> : null}
      </Stub>
    </div>
  );
}

export function NextGamePass({ team, next }: { team: Team; next: LiveGame | null }) {
  const opp = next ? findTeam(next.homeId === team.id ? next.awayId : next.homeId) : null;
  return (
    <div className="relative mx-4 text-club-on">
      <div className="rounded-t-[18px] bg-club-field">
        <div className="px-[18px] pt-[14px] text-[12px] font-semibold tracking-[0.04em] opacity-90">오늘은 쉬는 날</div>
        <TeamHead team={team} line={opp ? `다음 경기 ${opp.short}전 · ${next?.homeId === team.id ? "홈" : "원정"}` : "다음 경기 일정을 기다리는 중"} />
      </div>
      <Perforation />
      <Stub torn={false}>
        {next ? (
          <>
            <span className="font-num text-[40px] font-bold leading-none">{next.time}</span>
            <span className="text-right text-[15px] font-bold">{shortDate(next.date)}</span>
          </>
        ) : (
          <span className="text-[17px] font-bold">하루 쉬어 가요</span>
        )}
      </Stub>
    </div>
  );
}

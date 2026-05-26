import { findTeam } from "@/lib/teams";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  markDispatchOnce,
  sendTeamTopicNotification,
} from "@/services/notificationService";
import type { LiveScoreGame } from "@/lib/score/types";

const NAVER_BASE = "https://api-gw.sports.naver.com";
const NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0";

async function fetchCurrentInning(externalId: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${NAVER_BASE}/schedule/games/${externalId}/relay`, {
      headers: {
        "user-agent": NAVER_UA,
        accept: "application/json",
        referer: "https://m.sports.naver.com/",
      },
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const result = json["result"] as Record<string, unknown> | undefined;

    // 네이버 relay: currentInning 또는 textRelays 마지막 항목의 inn
    const direct = result?.["currentInning"] ?? json["currentInning"];
    if (typeof direct === "number") return direct;
    if (typeof direct === "string") return parseInt(direct) || null;

    const trd = result?.["textRelayData"] as Record<string, unknown> | undefined;
    const textRelays = trd?.["textRelays"];
    if (Array.isArray(textRelays) && textRelays.length > 0) {
      const last = textRelays[textRelays.length - 1] as Record<string, unknown>;
      const raw = last["inn"] ?? last["inning"];
      if (typeof raw === "number") return raw;
      if (typeof raw === "string") return parseInt(raw) || null;
    }
    return null;
  } catch {
    return null;
  }
}

type EmotionTone = "gain" | "nervous" | "neutral";

function getEmotionTone(myScore: number, oppScore: number, inning: number | null): EmotionTone {
  if (inning == null || inning < 6) return "neutral";
  if (myScore < oppScore) return "gain";
  if (myScore > oppScore) return "nervous";
  return "neutral";
}

function buildCopy(input: {
  myTeamShort: string;
  oppTeamShort: string;
  myScore: number;
  oppScore: number;
  inning: number | null;
  emotion: EmotionTone;
}): { title: string; body: string } {
  const { myTeamShort, oppTeamShort, myScore, oppScore, inning, emotion } = input;
  const innText = inning ? `${inning}회 ` : "";
  const scoreText = `${myTeamShort} ${myScore}:${oppScore} ${oppTeamShort}`;
  const title = `🌧️ ${myTeamShort} 경기 우천 중단`;

  switch (emotion) {
    case "gain":
      return {
        title,
        body: `${innText}현재 ${scoreText}. 지고 있는데 비가 내리네요. 하늘이 우리 편인가요? ☁️`,
      };
    case "nervous":
      return {
        title,
        body: `${innText}현재 ${scoreText}. 이기고 있는데 우천 중단... 이 리드, 지킬 수 있을까요? 😰`,
      };
    default:
      return {
        title,
        body: `${innText}현재 ${scoreText}. 우천으로 경기가 잠시 중단됐습니다.`,
      };
  }
}

/**
 * 진행 중인 경기가 우천으로 중단(LIVE → SUSPENDED)됐을 때 양 팀 팬에게 1회 발송.
 * 6회 이후 기준으로 지고 있으면 "개이득", 이기고 있으면 "쫄리는" 감정을 담는다.
 */
export async function sendRainDelayAlerts(input: {
  game: LiveScoreGame;
  targetDate: string;
  origin: string;
}): Promise<{ sent: number; disabled: number; inboxCreated: number; skipped: number }> {
  const inning = await fetchCurrentInning(input.game.externalId);
  const teamIds = [input.game.homeTeam, input.game.awayTeam];
  let sent = 0;
  let disabled = 0;
  let inboxCreated = 0;
  let skipped = 0;

  await mapWithConcurrency(teamIds, 2, async (teamId) => {
    const lock = await markDispatchOnce({
      alertKind: "rain-delay",
      teamScope: teamId,
      eventKey: `${input.targetDate}:${input.game.externalId}:rain-delay`,
      gameExternalId: input.game.externalId,
    });
    if (!lock) {
      skipped += 1;
      return;
    }

    const isHomeFan = teamId === input.game.homeTeam;
    const myTeam = findTeam(teamId);
    const oppTeam = findTeam(isHomeFan ? input.game.awayTeam : input.game.homeTeam);
    const myScore = isHomeFan ? input.game.homeScore : input.game.awayScore;
    const oppScore = isHomeFan ? input.game.awayScore : input.game.homeScore;

    const emotion = getEmotionTone(myScore, oppScore, inning);
    const copy = buildCopy({
      myTeamShort: myTeam.short,
      oppTeamShort: oppTeam.short,
      myScore,
      oppScore,
      inning,
      emotion,
    });

    const result = await sendTeamTopicNotification({
      teamId,
      topicKey: "score",
      title: copy.title,
      body: copy.body,
      url: "/today",
      payload: {
        kind: "rain-delay",
        externalId: input.game.externalId,
        homeTeam: input.game.homeTeam,
        awayTeam: input.game.awayTeam,
        teamId,
        inning,
        emotion,
        homeScore: input.game.homeScore,
        awayScore: input.game.awayScore,
      },
      type: "SCORE_UPDATE",
      origin: input.origin,
    });

    sent += result.sent;
    disabled += result.disabled;
    inboxCreated += result.inboxCreated;
  });

  return { sent, disabled, inboxCreated, skipped };
}

import { NextResponse } from "next/server";
import { fetchKboSchedule, todayKstDate } from "@/lib/kbo";
import { findTeam } from "@/lib/teams";
import { shouldSkipCronInAlpha } from "@/lib/appEnv";
import { authorizeCron, markDispatchOnce, sendTeamTopicNotification } from "@/services/notificationService";
import { generateLiveEventCopy } from "@/lib/pushLlm";
import { isKboGameHour } from "@/lib/cronGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const NAVER_BASE = "https://api-gw.sports.naver.com";
const NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/**
 * 이닝 초/말 + 감지된 이벤트 정보.
 * inningSub: "1" = 초(top) = 원정팀 공격 / 홈팀 수비
 *            "2" = 말(bottom) = 홈팀 공격 / 원정팀 수비
 *            null = 판별 불가
 */
type LiveEventKind = "pitcherChange" | "strikeout" | "homeRun";

type RelayInfo = {
  eventKinds: Array<LiveEventKind>;
  /** 현재 공격 중인 팀 측 ("home" | "away" | null) */
  battingSide: "home" | "away" | null;
  /** 현재 이닝 번호 (null=불명) */
  inning: number | null;
  /** 이닝 초/말 레이블 (예: "7회 초") */
  inningLabel: string | null;
  eventKey: string;
};

type RelayEntry = {
  text?: string;
  title?: string;
  seqNo?: number | string;
  no?: number | string;
  inning?: number;
  inn?: number;
  inningSub?: string | number;
  homeOrAway?: string | number;
  titleStyle?: string | number;
  textOptions?: Array<{ text?: string; title?: string; playText?: string; [k: string]: unknown }>;
};

/**
 * relay JSON 에서 중계 텍스트 배열을 추출.
 * Naver API 응답 구조가 버전마다 다르므로 여러 경로를 시도.
 */
function extractRelayEntries(json: Record<string, unknown>): RelayEntry[] {
  const result = json["result"] as Record<string, unknown> | undefined;
  const trd = result?.["textRelayData"];

  // 실제 Naver 구조: result.textRelayData.textRelays
  if (trd && typeof trd === "object" && !Array.isArray(trd)) {
    const textRelays = (trd as Record<string, unknown>)["textRelays"];
    if (Array.isArray(textRelays) && textRelays.length > 0) return textRelays as RelayEntry[];
    // 다른 배열 필드 fallback
    for (const v of Object.values(trd as object)) {
      if (Array.isArray(v) && v.length > 0) return v as RelayEntry[];
    }
  }
  if (Array.isArray(trd) && trd.length > 0) return trd as RelayEntry[];

  // 기존 fallback 경로들
  const candidates = [
    json["relayTexts"],
    result?.["relayTexts"],
    (json["relay"] as Record<string, unknown> | undefined)?.["relayTexts"],
    result?.["relay"] && (result["relay"] as Record<string, unknown>)?.["relayTexts"],
    json["texts"],
    result?.["texts"],
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c as RelayEntry[];
  }
  return [];
}

async function fetchRelayInfo(gameId: string): Promise<{ relays: RelayInfo[]; debugStatuses: string[] }> {
  const endpoints = [
    `${NAVER_BASE}/schedule/games/${gameId}/relay`,
    `${NAVER_BASE}/schedule/games/${gameId}/relay?fields=relayTexts`,
    `${NAVER_BASE}/schedule/games/${gameId}?fields=relay`,
    `${NAVER_BASE}/schedule/games/${gameId}/relayTexts`,
    `${NAVER_BASE}/schedule/games/${gameId}/liveText`,
    `${NAVER_BASE}/schedule/games/${gameId}/relay?size=50`,
  ];
  const debugStatuses: string[] = [];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "user-agent": NAVER_UA,
          accept: "application/json",
          referer: "https://m.sports.naver.com/",
          "accept-language": "ko-KR,ko;q=0.9",
        },
        cache: "no-store",
      });
      const shortPath = endpoint.replace(`${NAVER_BASE}/schedule/games/${gameId}`, "");
      debugStatuses.push(`${shortPath}→${res.status}`);
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, unknown>;
      const topKeys = Object.keys(json).slice(0, 10).join(",");
      debugStatuses.push(`keys:${topKeys}`);
      // 첫 번째 200 응답의 result 구조 샘플링
      if (shortPath === "/relay") {
        const result = json["result"] as Record<string, unknown> | undefined;
        if (result) {
          debugStatuses.push(`result_keys:${Object.keys(result).slice(0, 15).join(",")}`);
          // textRelayData 구조 확인
          const trd = result["textRelayData"];
          debugStatuses.push(`textRelayData_type:${Array.isArray(trd) ? `array(${(trd as unknown[]).length})` : typeof trd}`);
          if (trd && typeof trd === "object" && !Array.isArray(trd)) {
            debugStatuses.push(`textRelayData_obj_keys:${Object.keys(trd as object).slice(0, 10).join(",")}`);
            // 중첩 배열 찾기
            for (const [k2, v2] of Object.entries(trd as object)) {
              if (Array.isArray(v2) && v2.length > 0) {
                debugStatuses.push(`textRelayData.${k2}[0]:${JSON.stringify(v2[0]).slice(0, 150)}`);
                break;
              }
            }
          } else if (Array.isArray(trd) && (trd as unknown[]).length > 0) {
            debugStatuses.push(`textRelayData[0]:${JSON.stringify((trd as unknown[])[0]).slice(0, 150)}`);
          }
        }
      }

      const entries = extractRelayEntries(json);

      console.log(`[live-events] entries count for ${gameId}:`, entries.length,
        entries.slice(-3).map(e => ({
          title: e.title?.slice(0, 20),
          plays: (e.textOptions ?? []).map(o => o.playText).filter(Boolean).slice(0, 3),
        })));
      if (entries.length > 0) {
        // 최근 5개 엔트리 검사 — 1분 크론 주기 사이에 밀린 이벤트 커버
        const recentEntries = entries.slice(-5);
        const results: RelayInfo[] = [];

        for (const entry of recentEntries) {
          // title 우선, text fallback, textOptions 안 텍스트도 합산
          const mainText = (entry.title ?? entry.text ?? "");
          const optionTexts = (entry.textOptions ?? [])
            .map((o) => [o.playText, o.title, o.text].filter(Boolean).join(" "))
            .join(" ");
          const fullText = `${mainText} ${optionTexts}`;

          const eventKinds: Array<LiveEventKind> = [];
          if (/투수\s*교체|투수교체|구원등판/.test(fullText)) eventKinds.push("pitcherChange");
          if (/삼진|탈삼진/.test(fullText)) eventKinds.push("strikeout");
          if (/홈런/.test(fullText)) eventKinds.push("homeRun");
          if (eventKinds.length === 0) continue;

          const seqNo = entry.seqNo ?? entry.no;
          const seqId = seqNo != null ? String(seqNo) : mainText.slice(0, 60);
          const eventKey = `seq:${seqId}`;

          const inning = typeof entry.inn === "number" ? entry.inn
            : typeof entry.inning === "number" ? entry.inning : null;

          // homeOrAway: "0"=초(top)=away batting, "1"=말(bottom)=home batting
          const ha = entry.homeOrAway ?? entry.inningSub;
          let battingSide: "home" | "away" | null = null;
          if (ha === "0" || ha === 0) battingSide = "away";
          else if (ha === "1" || ha === 1) battingSide = "home";
          else if (ha === "2" || ha === 2) battingSide = "home";
          else battingSide = resolveInningSide(json);

          const halfLabel = battingSide === "away" ? "초" : battingSide === "home" ? "말" : null;
          const inningLabel = inning != null && halfLabel ? `${inning}회 ${halfLabel}` : null;

          results.push({ eventKinds, battingSide, inning, inningLabel, eventKey });
        }

        if (results.length > 0) return { relays: results, debugStatuses };
        debugStatuses.push("no_event_in_entries");
        return { relays: [], debugStatuses };
      }

      debugStatuses.push("entries_empty");
      continue;
    } catch (e) {
      debugStatuses.push(`err:${String(e).slice(0, 40)}`);
    }
  }
  return { relays: [], debugStatuses };
}

/**
 * Naver relay JSON 에서 현재 공격 중인 팀 측을 추출.
 * inningSub "1"(초/TOP) = 원정팀 공격, "2"(말/BOTTOM) = 홈팀 공격.
 * Naver API 버전마다 필드명이 달라 가능한 모든 경로를 시도.
 */
function resolveInningSide(json: Record<string, unknown>): "home" | "away" | null {
  const result = json["result"] as Record<string, unknown> | undefined;
  const relay  = (json["relay"] ?? result?.["relay"]) as Record<string, unknown> | undefined;

  // inningSub 숫자/문자 "1"=초=원정공격, "2"=말=홈공격
  const subCandidates: unknown[] = [
    json["inningSub"],          result?.["inningSub"],
    relay?.["inningSub"],
    json["currentInningSub"],   result?.["currentInningSub"],
    relay?.["currentInningSub"],
    json["halfInning"],         result?.["halfInning"],
  ];
  for (const val of subCandidates) {
    if (val === "1" || val === 1) return "away";
    if (val === "2" || val === 2) return "home";
  }

  // "TOP"/"BOTTOM" 또는 "초"/"말" 문자열
  const halfCandidates: unknown[] = [
    json["half"],         result?.["half"],         relay?.["half"],
    json["currentHalf"],  result?.["currentHalf"],  relay?.["currentHalf"],
    json["inningHalf"],   result?.["inningHalf"],
    json["halfText"],     result?.["halfText"],
  ];
  for (const val of halfCandidates) {
    if (typeof val !== "string") continue;
    const v = val.toUpperCase();
    if (v === "TOP"    || v === "초") return "away";
    if (v === "BOTTOM" || v === "말") return "home";
  }

  // 마지막 수단: JSON 문자열에서 패턴 추출
  const text = JSON.stringify(json);
  // "inningSub":"1" 또는 "currentInningSub":1 등
  const m1 = text.match(/"(?:inningSub|currentInningSub|halfInning)"\s*:\s*"?([12])"?/);
  if (m1) return m1[1] === "1" ? "away" : "home";
  // "half":"TOP"/"BOTTOM"
  const m2 = text.match(/"(?:half|currentHalf|inningHalf|halfText)"\s*:\s*"(TOP|BOTTOM|초|말)"/i);
  if (m2) {
    const v = m2[1].toUpperCase();
    if (v === "TOP"    || v === "초") return "away";
    if (v === "BOTTOM" || v === "말") return "home";
  }
  return null;
}

/**
 * 공수(攻守) 관점에 맞는 알림 문구 생성.
 * 모든 body 앞에 "[X회 초/말]" 이닝 레이블을 포함.
 */
function buildLiveEventCopy(
  kind: LiveEventKind,
  myTeamShort: string,
  oppTeamShort: string,
  isPitching: boolean | null,
  inningLabel: string | null,
): { title: string; body: string } {
  const inning = inningLabel ? `[${inningLabel}] ` : "";

  if (kind === "homeRun") {
    if (isPitching === false) {
      return {
        title: "💥 홈런!",
        body: `${inning}${myTeamShort} 홈런 작렬!! 점수 추가됐다!`,
      };
    }
    if (isPitching === true) {
      return {
        title: "💥 홈런 허용",
        body: `${inning}${myTeamShort} 홈런 맞았다... 빨리 따라잡자.`,
      };
    }
    return {
      title: "💥 홈런 발생",
      body: `${inning}${myTeamShort}-${oppTeamShort}전 홈런 발생.`,
    };
  }

  if (kind === "strikeout") {
    if (isPitching === true) {
      return {
        title: "⚡ 탈삼진!",
        body: `${inning}${myTeamShort} 투수 방금 삼진 잡았다! 이 기세 그대로 가자.`,
      };
    }
    if (isPitching === false) {
      return {
        title: "⚡ 삼진 아웃",
        body: `${inning}${myTeamShort} 타자 삼진 아웃... 다음 타자가 살려줘.`,
      };
    }
    return {
      title: "⚡ 라이브 경기 상황",
      body: `${inning}${myTeamShort}-${oppTeamShort}전 탈삼진 발생.`,
    };
  }

  // pitcherChange
  if (isPitching === true) {
    return {
      title: "🎯 투수 교체",
      body: `${inning}${myTeamShort} 투수 교체. 이 위기 막아야 한다.`,
    };
  }
  if (isPitching === false) {
    return {
      title: "🎯 상대 투수 교체",
      body: `${inning}상대가 투수 교체했다. ${myTeamShort}, 지금이 찬스다!`,
    };
  }
  return {
    title: "🎯 라이브 경기 상황",
    body: `${inning}${myTeamShort}-${oppTeamShort}전 투수 교체 발생.`,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  // auth check temporarily open for debugging — re-enable after live-events confirmed working
  // const auth = authorizeCron(req, url);
  // if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (shouldSkipCronInAlpha(url)) return NextResponse.json({ ok: true, skipped: "ALPHA_ENV_CRON_DISABLED" });

  // 경기 시간대 외에는 즉시 종료 (주중 18~22:30, 주말 14~21시)
  if (!isKboGameHour()) {
    return NextResponse.json({ ok: true, skipped: "OUT_OF_GAME_HOURS" });
  }

  const date = todayKstDate();
  const schedule = await fetchKboSchedule(date);
  const liveGames = schedule.today.filter((game) => game.status === "LIVE");
  let sent = 0;
  let skipped = 0;
  const debugRelays: Array<{ gameId: string; relayCount: number; eventKeys: string[]; debugStatuses: string[] }> = [];
  // Claude 호출 캐시: 같은 (gameId:kind:seqNo:isPitching) 조합은 1회만 호출
  const llmCache = new Map<string, Promise<string>>();

  for (const game of liveGames) {
    const { relays, debugStatuses } = await fetchRelayInfo(game.id);
    debugRelays.push({ gameId: game.id, relayCount: relays.length, eventKeys: relays.map(r => r.eventKey), debugStatuses });
    if (relays.length === 0) continue;

    for (const relay of relays) {
      for (const kind of relay.eventKinds) {
        for (const teamId of [game.homeId, game.awayId]) {
          const lock = await markDispatchOnce({
            alertKind: "live-event",
            teamScope: teamId,
            eventKey: `${game.id}:${kind}:${relay.eventKey}`,
            gameExternalId: game.id,
          });
          if (!lock) {
            skipped += 1;
            continue;
          }

          const opponentTeamId = teamId === game.homeId ? game.awayId : game.homeId;
          const teamSide: "home" | "away" = teamId === game.homeId ? "home" : "away";

          let isPitching: boolean | null = null;
          if (relay.battingSide !== null) {
            isPitching = relay.battingSide !== teamSide;
          }

          const myTeamShort  = findTeam(teamId).short;
          const oppTeamShort = findTeam(opponentTeamId).short;
          const fallback = buildLiveEventCopy(kind, myTeamShort, oppTeamShort, isPitching, relay.inningLabel);

          const myCurrentScore = teamSide === "home"
            ? game.liveScore?.homeScore
            : game.liveScore?.awayScore;
          const oppCurrentScore = teamSide === "home"
            ? game.liveScore?.awayScore
            : game.liveScore?.homeScore;

          const llmCacheKey = `${game.id}:${kind}:${relay.eventKey}:${String(isPitching)}`;
          let llmPromise = llmCache.get(llmCacheKey);
          if (!llmPromise) {
            llmPromise = generateLiveEventCopy({
              kind: kind as "strikeout" | "pitcherChange" | "homeRun",
              myTeamShort,
              oppTeamShort,
              isPitching,
              inningLabel: relay.inningLabel,
              myCurrentScore,
              oppCurrentScore,
              fallbackBody: fallback.body,
            });
            llmCache.set(llmCacheKey, llmPromise);
          }
          const llmBody = await llmPromise;

          // header: [N회] 내팀 S:O 상대팀 |
          const inning = relay.inningLabel ?? "";
          const scoreHeader = myCurrentScore != null && oppCurrentScore != null
            ? `[${inning}] ${myTeamShort} ${myCurrentScore}:${oppCurrentScore} ${oppTeamShort} | `
            : inning ? `[${inning}] ` : "";
          // Claude가 이미 헤더 포함해서 뱉은 경우 중복 방지
          const finalBody = llmBody.startsWith("[") ? llmBody : `${scoreHeader}${llmBody}`;

          const result = await sendTeamTopicNotification({
            teamId,
            topicKey: kind === "pitcherChange" ? "livePitcherChange" : kind === "homeRun" ? "liveHomeRun" : "liveStrikeout",
            title: fallback.title,
            body: finalBody,
            url: "/today",
            payload: {
              kind: "live-event",
              eventKind: kind,
              gameId: game.id,
              teamId,
              opponentTeamId,
              battingSide: relay.battingSide,
              isPitching,
            },
            type: "SYSTEM",
            origin: url.origin,
          });
          sent += result.sent;
        }
      }
    }
  }
  return NextResponse.json({ ok: true, date, sent, skipped, liveGames: liveGames.length, debug: debugRelays });
}

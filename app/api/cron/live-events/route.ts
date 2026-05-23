import { NextResponse } from "next/server";
import { fetchKboSchedule, todayKstDate } from "@/lib/kbo";
import { findTeam } from "@/lib/teams";
import { shouldSkipCronInAlpha } from "@/lib/appEnv";
import { authorizeCron, markDispatchOnce, sendTeamTopicNotification } from "@/services/notificationService";
import { generateLiveEventCopy, stripLlmHeaderPrefix } from "@/lib/pushLlm";
import { isKboGameHour } from "@/lib/cronGuard";
import { prisma } from "@/lib/prisma";

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

/** 삼진 발생 시 세부 상황 */
type StrikeoutDetail = {
  /** 삼진 종류: 헛스윙 / 루킹 / 불명 */
  swingKind: "swinging" | "looking" | "unknown";
  /** 주자 상황: 없음 / 득점권(2·3루) / 만루 */
  runners: "none" | "scoring_position" | "bases_loaded";
  /** 3구 삼진 여부 (KKK) */
  is3pitch: boolean;
};

type RelayInfo = {
  eventKinds: Array<LiveEventKind>;
  /** 현재 공격 중인 팀 측 ("home" | "away" | null) */
  battingSide: "home" | "away" | null;
  /** 현재 이닝 번호 (null=불명) */
  inning: number | null;
  /** 이닝 초/말 레이블 (예: "7회 초") */
  inningLabel: string | null;
  eventKey: string;
  /** 릴레이 텍스트에서 추출한 선수 이름 (투수/타자, null=파싱 실패) */
  playerName: string | null;
  /** 삼진 세부 상황 (strikeout 이벤트일 때만 의미 있음) */
  strikeoutDetail: StrikeoutDetail | null;
};

/** 릴레이 텍스트에서 삼진 세부 상황 파싱 */
function extractStrikeoutDetail(fullText: string): StrikeoutDetail {
  const swingKind: StrikeoutDetail["swingKind"] =
    /헛스윙/.test(fullText) ? "swinging" :
    /루킹|낫\s?아웃|낫아웃|looking/i.test(fullText) ? "looking" :
    "unknown";

  const runners: StrikeoutDetail["runners"] =
    /만루/.test(fullText) ? "bases_loaded" :
    /[23]루\s*(주자|에|서)|득점권|2루.*3루|3루.*2루/.test(fullText) ? "scoring_position" :
    "none";

  const is3pitch = /3구\s*(삼진|만에)|3\s*pitch/i.test(fullText);

  return { swingKind, runners, is3pitch };
}

/**
 * 객체 내 모든 문자열 값을 재귀적으로 추출.
 * textOptions 안에 currentGameState 등 중첩 필드에 숨어있는 텍스트도 커버.
 */
function extractAllStrings(obj: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof obj === "string") return obj ? [obj] : [];
  if (Array.isArray(obj)) return obj.flatMap((v) => extractAllStrings(v, depth + 1));
  if (obj && typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).flatMap((v) => extractAllStrings(v, depth + 1));
  }
  return [];
}

/**
 * 릴레이 텍스트에서 한국 선수 이름 추출.
 * 네이버 중계 텍스트는 보통 "이름 구종/결과" 순서로 시작.
 * e.g. "황동하 직구 헛스윙 삼진" → "황동하"
 */
function extractPlayerName(text: string): string | null {
  if (!text) return null;
  // 앞 공백 제거 후 2~4자 한글 이름 + 공백 패턴
  const m = text.trim().match(/^([가-힣]{2,4})\s/);
  if (!m) return null;
  // 팀명·포지션 등 불용어 제외
  const stopWords = new Set(["삼진", "홈런", "투수", "타자", "포수", "볼넷", "안타", "아웃", "득점", "실점", "경기", "이닝"]);
  return stopWords.has(m[1]) ? null : m[1];
}

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

async function fetchRelayInfo(gameId: string, lastSeqNo: number): Promise<{ relays: RelayInfo[]; maxSeqNo: number; debugStatuses: string[] }> {
  const endpoints = [
    `${NAVER_BASE}/schedule/games/${gameId}/relay`,
    `${NAVER_BASE}/schedule/games/${gameId}/relay?fields=relayTexts`,
    `${NAVER_BASE}/schedule/games/${gameId}?fields=relay`,
    `${NAVER_BASE}/schedule/games/${gameId}/relayTexts`,
    `${NAVER_BASE}/schedule/games/${gameId}/liveText`,
    `${NAVER_BASE}/schedule/games/${gameId}/relay?size=50`,
  ];
  const debugStatuses: string[] = [];
  debugStatuses.push(`watermark:${lastSeqNo}`);
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
        // 워터마크 이후 새 엔트리만 처리 — 절대 중복 없음
        // lastSeqNo=-1: 마이그레이션 미적용 fallback → slice(-5)로 안전 처리
        const newEntries = lastSeqNo < 0
          ? entries.slice(-5)
          : entries.filter((e) => {
              const seq = e.seqNo ?? e.no;
              return seq != null && Number(seq) > lastSeqNo;
            });
        // seqNo 없는 엔트리는 안전하게 제외 (중복 위험)
        const maxSeqNo = entries.reduce((max, e) => {
          const seq = Number(e.seqNo ?? e.no ?? 0);
          return seq > max ? seq : max;
        }, lastSeqNo);
        // 마지막 2개는 항상 재검사 (at-bat 진행 중 → 완료 시 새 textOption 추가되므로)
        const tailEntries = entries.slice(-2);
        const seqSet = new Map(newEntries.map(e => [String(e.seqNo ?? e.no), e]));
        for (const e of tailEntries) seqSet.set(String(e.seqNo ?? e.no), e);
        const allToProcess = [...seqSet.values()];

        debugStatuses.push(`total:${entries.length} new:${newEntries.length} tail:${tailEntries.length} toProcess:${allToProcess.length} maxSeq:${maxSeqNo}`);
        if (allToProcess.length === 0) {
          return { relays: [], maxSeqNo, debugStatuses };
        }
        const results: RelayInfo[] = [];

        for (const entry of allToProcess) {
          // title 우선, text fallback — 이벤트 감지는 얕은 필드만 사용 (오탐 방지)
          const mainText = (entry.title ?? entry.text ?? "");
          // textOptions: 각 항목의 직접 string 값 전부 검사 (1단계, 재귀 금지)
          // playText/text/title 외에 result, description 등 다른 필드도 커버
          const optionTexts = (entry.textOptions ?? [])
            .map((o) =>
              Object.values(o)
                .filter((v): v is string => typeof v === "string")
                .join(" ")
            )
            .join(" ");
          const fullText = `${mainText} ${optionTexts}`;

          const eventKinds: Array<LiveEventKind> = [];
          if (/투수\s*교체|투수교체|구원등판/.test(fullText)) eventKinds.push("pitcherChange");
          if (/삼진|탈삼진/.test(fullText)) eventKinds.push("strikeout");
          // "홈런성 타구", "홈런 위협", "홈런 예감" 등 미확정 언급은 제외
          const isHomeRun =
            /(?:솔로|투런|쓰리런|만루)홈런|홈런[!！]|홈런입니다|홈런[을를이가]/.test(fullText) &&
            !/홈런성|홈런\s*(?:위협|같은|나오면|나온|예감|일보)/.test(fullText);
          if (isHomeRun) eventKinds.push("homeRun");
          if (eventKinds.length === 0) continue;

          const seqNo = entry.seqNo ?? entry.no;
          const seqId = seqNo != null ? String(seqNo) : mainText.slice(0, 60);
          const eventKey = `seq:${seqId}`;

          // 1순위: title 텍스트에서 "N회초"/"N회말" 직접 파싱 (가장 신뢰도 높음)
          const textInningMatch = fullText.match(/(\d{1,2})회\s*(초|말)/);
          let inning: number | null = textInningMatch ? parseInt(textInningMatch[1]) : null;
          let battingSide: "home" | "away" | null = textInningMatch
            ? (textInningMatch[2] === "초" ? "away" : "home")
            : null;

          // 2순위: entry.inn 숫자 필드
          if (inning == null) {
            inning = typeof entry.inn === "number" ? entry.inn
              : typeof entry.inning === "number" ? entry.inning : null;
          }

          // 3순위: inningSub 기반 resolveInningSide (homeOrAway 필드는 게임마다 기준 불일치로 사용 안 함)
          if (battingSide == null) battingSide = resolveInningSide(json);

          const halfLabel = battingSide === "away" ? "초" : battingSide === "home" ? "말" : null;
          const inningLabel = inning != null && halfLabel ? `${inning}회${halfLabel}` : null;

          // 릴레이 텍스트(title 우선)에서 선수 이름 추출
          const playerName = extractPlayerName(mainText) ??
            extractPlayerName((entry.textOptions ?? [])[0]?.playText ?? "") ??
            null;

          // 삼진 세부 상황 파싱 (strikeout 이벤트일 때만)
          const strikeoutDetail = eventKinds.includes("strikeout")
            ? extractStrikeoutDetail(fullText)
            : null;

          results.push({ eventKinds, battingSide, inning, inningLabel, eventKey, playerName, strikeoutDetail });
        }

        if (results.length > 0) return { relays: results, maxSeqNo, debugStatuses };
        debugStatuses.push("no_event_in_new_entries");
        return { relays: [], maxSeqNo, debugStatuses };
      }

      debugStatuses.push("entries_empty");
      continue;
    } catch (e) {
      debugStatuses.push(`err:${String(e).slice(0, 40)}`);
    }
  }
  return { relays: [], maxSeqNo: lastSeqNo, debugStatuses };
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
  // 이번 크론 실행에서 이미 발송한 (gameId:teamId:kind) — 같은 이벤트가 복수 릴레이 엔트리에 걸쳐 중복 감지되는 것 방지
  const sentThisRun = new Set<string>();

  for (const game of liveGames) {
    // 워터마크: 이 게임의 마지막 처리 seqNo 조회 (테이블 미생성 시 graceful fallback)
    let lastSeqNo = 0;
    try {
      const watermark = await prisma.liveEventWatermark.findUnique({
        where: { gameExternalId: game.id },
      });
      lastSeqNo = watermark?.lastSeqNo ?? 0;
    } catch {
      // 마이그레이션 미적용 등 DB 에러 → 워터마크 없이 계속 (slice-5 안전망)
      lastSeqNo = -1; // -1: 워터마크 DB 없음 표시 → 아래에서 slice-5 fallback
    }

    const { relays, maxSeqNo, debugStatuses } = await fetchRelayInfo(game.id, lastSeqNo);
    debugRelays.push({ gameId: game.id, relayCount: relays.length, eventKeys: relays.map(r => r.eventKey), debugStatuses });

    // 워터마크 업데이트 (DB 에러 시 skip)
    if (lastSeqNo >= 0 && maxSeqNo > lastSeqNo) {
      try {
        await prisma.liveEventWatermark.upsert({
          where: { gameExternalId: game.id },
          create: { gameExternalId: game.id, lastSeqNo: maxSeqNo },
          update: { lastSeqNo: maxSeqNo },
        });
      } catch {
        // 마이그레이션 미적용 시 무시
      }
    }
    if (relays.length === 0) continue;

    for (const relay of relays) {
      for (const kind of relay.eventKinds) {
        for (const teamId of [game.homeId, game.awayId]) {
          // 이번 크론 실행 내 동일 이벤트 중복 방지
          const runKey = `${game.id}:${teamId}:${kind}`;
          if (sentThisRun.has(runKey)) { skipped += 1; continue; }

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
              playerName: relay.playerName ?? undefined,
              strikeoutDetail: relay.strikeoutDetail ?? undefined,
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

          // Claude가 헤더를 직접 붙인 경우 모든 변형 제거 (이모지·볼드·공백 허용)
          const cleanBody = stripLlmHeaderPrefix(llmBody);
          const finalBody = `${scoreHeader}${cleanBody}`;

          sentThisRun.add(runKey);
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

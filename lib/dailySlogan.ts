/**
 * 데일리 슬로건 소스 (server-safe)
 *
 * 외부 슬로건 서비스/CMS와의 연결 포인트. 지금은 풀(Pool)에서 결정론적으로 픽하지만,
 * 추후 fetch 기반으로 교체해도 인터페이스만 동일하게 유지하면 호출 측 영향 없음.
 *
 * - 입력: 팀, 상대팀, 날짜, 홈/원정, 모드(ready|victory)
 * - 출력: 그날의 슬로건 문자열 (없으면 null → 호출 측에서 TEAM_CONFIG 폴백)
 */

import { getTeamConfig, type GenerateMode } from "@/config/teams";

export type DailySloganContext = {
  teamId: string;
  opponentId?: string | null;
  date?: string; // YYYY-MM-DD
  isHome?: boolean;
  mode?: GenerateMode;
};

type Pool = { ready: string[]; victory: string[] };

/** 팀별 카피 풀 — 영문 매거진 톤. 풀이 없으면 fallback 진입. */
const POOL: Record<string, Pool> = {
  LG: {
    ready: [
      "TONIGHT, JAMSIL ROARS",
      "SEOUL IN OUR HANDS",
      "TWINS NEVER YIELD",
      "ONE MORE FOR THE CROWN",
      "BORN TO RISE",
    ],
    victory: [
      "JAMSIL UNDER PURPLE LIGHTS",
      "SEOUL BELONGS TO US",
      "ANOTHER NIGHT, ANOTHER WIN",
    ],
  },
  KIA: {
    ready: [
      "GWANGJU AWAKENS",
      "TIGERS WALK FIRST",
      "THE STRIPE NEVER FADES",
      "FROM THE SOUTH WITH FANGS",
    ],
    victory: ["TIGERS RULE THE NIGHT", "DYNASTY MARCHES ON"],
  },
  KT: {
    ready: ["MAGIC IGNITES", "SUWON WIZARDRY", "SPELL CAST AT FIRST PITCH"],
    victory: ["WIZARDS WROTE THE SCRIPT", "SUWON SPELL UNBROKEN"],
  },
  SSG: {
    ready: ["FROM THE SEA, WE COME", "INCHEON TIDE RISES", "LANDERS HOLD THE LINE"],
    victory: ["TIDE TURNED, OURS", "LANDERS CLAIM THE SHORE"],
  },
  NC: {
    ready: ["DINOS ON THE HUNT", "CHANGWON GROUND TREMBLES", "BORN OF THE NEW ERA"],
    victory: ["NEW ERA, OUR ERA", "CHANGWON UNDER OUR FEET"],
  },
  DOOSAN: {
    ready: ["BEARS NEVER BOW", "JAMSIL WEARS NAVY TONIGHT", "FROM SHADOW, BEARS RISE"],
    victory: ["DYNASTY RESTORED", "BEARS REWRITE THE NIGHT"],
  },
  SAMSUNG: {
    ready: ["LIONS RISE AT DUSK", "DAEGU BURNS BRIGHT", "ROAR FIRST, ASK LATER"],
    victory: ["KING OF THE FIELD", "DAEGU CROWNS THE LIONS"],
  },
  LOTTE: {
    ready: ["BUSAN STANDS, GIANTS WALK", "SAJIK CALLS, GIANTS ANSWER", "GIANTS ARE BACK"],
    victory: ["BUSAN ROARS TONIGHT", "GIANTS CLAIM THE COAST"],
  },
  HANWHA: {
    ready: ["EAGLES ASCEND", "THE SKY OPENS IN DAEJEON", "WINGS UNFOLDED"],
    victory: ["SKY IS OURS", "EAGLES OWN THE NIGHT"],
  },
  KIWOOM: {
    ready: ["HEROES UNTOLD", "GOCHEOK CHAPTER ONE", "RISE WITHOUT WARNING"],
    victory: ["LEGEND WRITTEN", "GOCHEOK CHAPTER CLOSED, OURS"],
  },
};

/** 같은 도시 더비/라이벌 매치 — 우선 카피 발동 */
const DERBY_PAIRS: Array<[string, string]> = [
  ["LG", "DOOSAN"], // 잠실 더비
  ["KIA", "SAMSUNG"], // V 라이벌리
  ["LOTTE", "SAMSUNG"], // 영남 더비
];

function isDerby(a: string, b: string): boolean {
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  return DERBY_PAIRS.some(
    ([x, y]) => (A === x && B === y) || (A === y && B === x)
  );
}

/** 결정론적 해시 — 같은 (팀, 날짜, 상대) 조합은 항상 같은 카피 */
function djb2(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getDailySlogan(ctx: DailySloganContext): string | null {
  const cfg = getTeamConfig(ctx.teamId);
  if (!cfg) return null;

  const mode: GenerateMode = ctx.mode ?? "ready";

  // 1) 더비/라이벌 우선
  if (ctx.opponentId && isDerby(cfg.teamId, ctx.opponentId)) {
    return mode === "victory"
      ? `DERBY CONQUERED · ${cfg.teamId}`
      : "DERBY DAY · NO RETREAT";
  }

  // 2) 팀 풀에서 결정론적 픽
  const pool = POOL[cfg.teamId];
  if (!pool) return null;
  const list = mode === "victory" ? pool.victory : pool.ready;
  if (!list.length) return null;

  const seed = djb2(
    `${cfg.teamId}|${ctx.date ?? ""}|${ctx.opponentId ?? ""}|${mode}`
  );
  return list[seed % list.length];
}

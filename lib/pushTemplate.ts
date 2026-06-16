export type PushPulseState = "lead" | "trail" | "tie" | "comeback";
export type ScoreTone = "for" | "against";

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickBySeed<T>(seed: string, items: readonly T[]): T {
  return items[hashSeed(seed) % items.length] ?? items[0];
}

function extractInning(latestPlayText?: string): number | null {
  const m = latestPlayText?.match(/(\d{1,2})회(?:초|말)?/);
  if (!m) return null;
  const inning = Number.parseInt(m[1], 10);
  return Number.isFinite(inning) ? inning : null;
}

function normalizeForSimilarity(text: string): string {
  return compactText(text)
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^[가-힣A-Za-z]+\s+\d+:\d+\s+[가-힣A-Za-z]+\s*\|\s*/, "")
    .replace(/\d+/g, "N")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const aSet = new Set(a.split(" ").filter((token) => token.length > 1));
  const bSet = new Set(b.split(" ").filter((token) => token.length > 1));
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let inter = 0;
  for (const token of aSet) {
    if (bSet.has(token)) inter += 1;
  }
  const union = aSet.size + bSet.size - inter;
  return union <= 0 ? 0 : inter / union;
}

function isNearRecentCopy(candidate: string, recentBodies: readonly string[] = []): boolean {
  const normalizedCandidate = normalizeForSimilarity(candidate);
  if (!normalizedCandidate) return false;
  return recentBodies.some((body) => {
    const normalizedBody = normalizeForSimilarity(body);
    if (!normalizedBody) return false;
    if (normalizedBody === normalizedCandidate) return true;
    return tokenOverlap(normalizedCandidate, normalizedBody) >= 0.58;
  });
}

function pickNovelBySeed(
  seed: string,
  candidates: readonly string[],
  recentBodies?: readonly string[]
): string {
  const normalized = candidates.map(compactText).filter(Boolean);
  if (normalized.length === 0) return "";
  const start = hashSeed(seed) % normalized.length;
  for (let i = 0; i < normalized.length; i += 1) {
    const candidate = normalized[(start + i) % normalized.length];
    if (!isNearRecentCopy(candidate, recentBodies)) return candidate;
  }
  return normalized[start];
}

export function computePulseState(
  previousMyScore: number | null,
  previousOppScore: number | null,
  myScore: number,
  oppScore: number
): PushPulseState {
  if (
    previousMyScore != null &&
    previousOppScore != null &&
    previousMyScore < previousOppScore &&
    myScore > oppScore
  ) {
    return "comeback";
  }
  if (myScore > oppScore) return "lead";
  if (myScore < oppScore) return "trail";
  return "tie";
}

export function buildBiasedScoreCopy(input: {
  teamShort: string;
  oppShort: string;
  myScore: number;
  oppScore: number;
  tone: ScoreTone;
  state: PushPulseState;
  latestPlayText?: string;
  recentBodies?: readonly string[];
}): { title: string; body: string } {
  const { teamShort, oppShort, myScore, oppScore, tone, state, latestPlayText, recentBodies } = input;
  const gap = Math.abs(myScore - oppScore);
  const inning = extractInning(latestPlayText);
  const phase = inning == null ? "mid" : inning >= 7 ? "late" : inning >= 4 ? "mid" : "early";
  const seed = [
    teamShort,
    oppShort,
    myScore,
    oppScore,
    tone,
    state,
    latestPlayText ?? "",
    recentBodies?.slice(0, 3).join("|") ?? "",
  ].join(":");

  const title = pickBySeed(`${seed}:title`, buildScoreTitleCandidates(teamShort, tone, state, gap));
  const body = pickNovelBySeed(
    `${seed}:body`,
    buildScoreBodyCandidates({ teamShort, oppShort, myScore, oppScore, tone, state, gap, inning, phase }),
    recentBodies
  );
  return { title, body };
}

function buildScoreTitleCandidates(
  teamShort: string,
  tone: ScoreTone,
  state: PushPulseState,
  gap: number
): string[] {
  if (tone === "for") {
    if (state === "comeback") {
      return [
        `🔥 ${teamShort} 역전`,
        `💥 ${teamShort} 판 뒤집음`,
        `🚨 ${teamShort} 역전 알림`,
        `📣 ${teamShort} 응원석 폭발`,
        `⚾ ${teamShort} 흐름 전환`,
        `🧨 ${teamShort} 뒤집었다`,
        `🔥 ${teamShort} 경기 흔든다`,
        `💫 ${teamShort} 타선 응답`,
      ];
    }
    if (state === "tie") {
      return [
        `⚾ ${teamShort} 동점`,
        `🔥 ${teamShort} 균형 맞춤`,
        `📣 ${teamShort} 다시 원점`,
        `💥 ${teamShort} 따라잡았다`,
        `🫀 ${teamShort} 심장 재가동`,
        `🚨 ${teamShort} 동점 알림`,
        `🥁 ${teamShort} 경기 재점화`,
        `⚾ ${teamShort} 원점 복귀`,
      ];
    }
    if (state === "trail") {
      return [
        `🔥 ${teamShort} 추격`,
        `📣 ${teamShort} 따라붙음`,
        `⚾ ${teamShort} 반격 시작`,
        `🚨 ${teamShort} 불씨 점화`,
        `🫀 ${teamShort} 불씨 살림`,
        `💥 ${teamShort} 공격 응답`,
        `🥁 ${teamShort} 다시 붙는다`,
        `🔥 ${teamShort} 알림창 가동`,
      ];
    }
    return [
      `🔥 ${teamShort} 득점`,
      `📣 ${teamShort} 앞선다`,
      `⚾ ${teamShort} 공격 성공`,
      gap === 1 ? `😬 ${teamShort} 한 점 앞섬` : `🚀 ${teamShort} 점수 벌림`,
      `💥 ${teamShort} 점수판 흔듦`,
      `🥁 ${teamShort} 응원석 반응`,
      `🫀 ${teamShort} 타이밍 득점`,
      `🧨 ${teamShort} 압박 성공`,
      `🔥 ${teamShort} 흐름 잡음`,
      `⚾ ${teamShort} 한 점의 온도`,
    ];
  }

  if (state === "tie") {
    return [
      `⚠️ ${teamShort} 동점 허용`,
      `😮‍💨 ${teamShort} 다시 원점`,
      `🚨 ${teamShort} 흐름 경고`,
      `🧯 ${teamShort} 불씨 조심`,
      `😬 ${teamShort} 살얼음판`,
      `📉 ${teamShort} 리드 삭제`,
      `⚾ ${teamShort} 바로 응답 필요`,
      `🔒 ${teamShort} 다시 잠가야`,
    ];
  }
  if (state === "lead") {
    return [
      `⚠️ ${teamShort} 실점`,
      `😮‍💨 ${teamShort} 불씨 조심`,
      gap === 1 ? `😬 ${teamShort} 한 점 차` : `🚨 ${teamShort} 간격 좁혀짐`,
      `🧯 ${teamShort} 바로 진화`,
      `🔒 ${teamShort} 다시 잠가야`,
      `📉 ${teamShort} 흐름 경고`,
      `⚾ ${teamShort} 수비 집중`,
      `🫠 ${teamShort} 아픈 실점`,
    ];
  }
  return [
    `🚨 ${teamShort} 실점`,
    `⚠️ ${teamShort} 위기`,
    `😮‍💨 ${teamShort} 점수 허용`,
    `📉 ${teamShort} 흐름 밀림`,
    `🧯 ${teamShort} 급한 불`,
    `😬 ${teamShort} 답 필요`,
    `⚾ ${teamShort} 바로 끊어야`,
    `🔒 ${teamShort} 수비 재정비`,
  ];
}

type ScoreBodyContext = {
  teamShort: string;
  oppShort: string;
  myScore: number;
  oppScore: number;
  tone: ScoreTone;
  state: PushPulseState;
  gap: number;
  inning: number | null;
  phase: "early" | "mid" | "late";
};

function combineCopyParts(
  openers: readonly string[],
  middles: readonly string[],
  closers: readonly string[]
): string[] {
  const out: string[] = [];
  for (const opener of openers) {
    for (const middle of middles) {
      for (const closer of closers) {
        const candidate = `${opener} ${middle} ${closer}`;
        if (!hasAwkwardRepeat(candidate)) out.push(candidate);
      }
    }
  }
  return out;
}

function hasAwkwardRepeat(text: string): boolean {
  return ["점수판", "상대", "팬들", "알림창", "수비", "압박"].some((word) => {
    const hits = text.match(new RegExp(word, "g"))?.length ?? 0;
    return hits >= 2;
  });
}

function buildScoreBodyCandidates(ctx: ScoreBodyContext): string[] {
  if (ctx.tone === "for") return buildScoreForBodyCandidates(ctx);
  return buildScoreAgainstBodyCandidates(ctx);
}

function buildScoreForBodyCandidates(ctx: ScoreBodyContext): string[] {
  if (ctx.state === "comeback") {
    return combineCopyParts(
      [
        "뒤집었습니다.",
        "이건 알림창 켜질 장면입니다.",
        "판이 우리 쪽으로 넘어왔습니다.",
        "방금 득점은 소리부터 다릅니다.",
        "상대 덕아웃 표정 굳을 타이밍입니다.",
        "팬들 손에 힘 들어갑니다.",
        "경기 온도가 확 바뀌었습니다.",
        "이 맛에 끝까지 봅니다.",
      ],
      [
        "역전까지 가져왔고",
        "점수판을 완전히 돌려세웠고",
        "흐름을 앞에서 잡아챘고",
        "가장 시끄러운 순간에 답을 냈고",
        "상대가 편하게 못 가게 만들었고",
        "응원석 목소리를 다시 키웠고",
      ],
      [
        "이제 수비에서 바로 잠그면 됩니다.",
        "여기서 더 흔들면 경기 냄새가 달라집니다.",
        "한 번 더 몰아치면 상대 멘탈이 먼저 흔들립니다.",
        "이 흐름은 절대 식히면 안 됩니다.",
        "다음 아웃카운트까지 같이 밀어붙입시다.",
        "오늘 알림창, 이제 재미있어졌습니다.",
      ]
    );
  }

  if (ctx.state === "tie") {
    return combineCopyParts(
      [
        "동점입니다.",
        "다시 원점입니다.",
        "경기가 다시 살아났습니다.",
        "상대가 제일 싫어할 타이밍에 따라붙었습니다.",
        "스코어보드가 다시 말을 듣기 시작했습니다.",
        "팬들 심장 박자 다시 올라갑니다.",
        "이제 진짜 승부입니다.",
        "알림 하나로 분위기가 확 바뀝니다.",
      ],
      [
        "방금 한 점이 경기장 소리를 바꿨고",
        "이제 양쪽 모두 숨 못 쉬는 구간이고",
        "벤치 계산도 다시 시작됐고",
        "상대 마운드도 편하게 못 던지고",
        "우리 타선이 문을 다시 열었고",
        "흐름이 다시 흔들리기 시작했고",
      ],
      [
        "여기서 바로 뒤집어야 합니다.",
        "다음 공격까지 온도 유지해야 합니다.",
        "이 기회를 그냥 보내면 안 됩니다.",
        "지금부터는 공 하나가 더 크게 보입니다.",
        "팬들은 이미 다음 점수 기다립니다.",
        "이제 상대가 먼저 불안해져야 합니다.",
      ]
    );
  }

  if (ctx.state === "trail") {
    return combineCopyParts(
      [
        "따라붙었습니다.",
        "이제 숨통은 붙었습니다.",
        "늦기 전에 알림창이 살아났습니다.",
        "추격의 불씨는 만들었습니다.",
        "상대가 편하게 못 갑니다.",
        "아직 뒤지만 경기 공기는 달라졌습니다.",
        "팬들 손바닥에 다시 땀이 납니다.",
        "지금 한 점은 작게 볼 점수가 아닙니다.",
      ],
      [
        `아직 ${ctx.gap}점 차지만`,
        "타선이 드디어 답을 냈고",
        "상대 마운드에 부담을 걸었고",
        "흐름을 다시 흔들 틈을 만들었고",
        "벤치가 다시 계산할 장면을 만들었고",
        "다음 타석까지 이어갈 이유를 만들었고",
      ],
      [
        "여기서 끊기면 너무 아깝습니다.",
        "바로 한 번 더 붙어야 합니다.",
        "다음 공격이 진짜 중요합니다.",
        "이제 상대가 편하게 숨 쉬면 안 됩니다.",
        "팬들 입장에서는 이제부터가 본게임입니다.",
        "한 번 더 알림 울릴 준비합시다.",
      ]
    );
  }

  const leadMiddle =
    ctx.gap === 1
      ? [
          "한 점 차라 살얼음판이지만",
          "편하게 볼 점수는 아니지만",
          "숨 막히는 간격이라 더 집중해야 하지만",
          "아직 손에 땀이 나는 점수지만",
          "불안한 한 점이라도",
          "한 점 싸움의 압박 속에서도",
        ]
      : ctx.phase === "late"
        ? [
            `${ctx.gap}점 차로 벌렸고`,
            "후반에 상대 추격 리듬을 끊었고",
            "상대 벤치 계산을 복잡하게 만들었고",
            "이닝 끝으로 갈수록 더 크게 느껴지는 점수를 만들었고",
            "지금 필요한 간격을 벌렸고",
            "팬들이 숨 돌릴 틈을 만들었고",
          ]
        : [
            `${ctx.gap}점 차로 앞서가고 있고`,
            "초중반 흐름을 우리 쪽으로 당겼고",
            "상대 마운드에 바로 부담을 걸었고",
            "점수판 간격을 더 벌렸고",
            "공격이 필요한 순간 답을 냈고",
            "응원석 목소리를 키울 이유를 만들었고",
          ];

  return combineCopyParts(
    [
      "좋습니다.",
      "방금 점수는 큽니다.",
      "타이밍이 좋습니다.",
      "점수판이 우리 편으로 움직였습니다.",
      "상대가 싫어할 득점입니다.",
      "응원석 소리 올라갑니다.",
      "이 한 점은 그냥 숫자가 아닙니다.",
      "알림창에 박아둘 장면입니다.",
    ],
    leadMiddle,
    [
      "다음 수비까지 차갑게 잠급시다.",
      "여기서 한 번 더 압박하면 됩니다.",
      "이 온도 식히면 안 됩니다.",
      "상대가 따라올 틈을 더 줄여야 합니다.",
      "팬들 심장도 같이 뛰기 시작했습니다.",
      "이제 공 하나씩 더 빡빡하게 갑시다.",
    ]
  );
}

function buildScoreAgainstBodyCandidates(ctx: ScoreBodyContext): string[] {
  if (ctx.state === "tie") {
    return combineCopyParts(
      [
        "동점 허용입니다.",
        "리드가 사라졌습니다.",
        "경기가 다시 원점으로 갔습니다.",
        "방금 실점은 정말 찝찝합니다.",
        "상대가 따라왔습니다.",
        "팬들 표정이 굳을 타이밍입니다.",
        "아웃카운트 하나가 더 무거워졌습니다.",
        "이건 바로 응답해야 하는 실점입니다.",
      ],
      [
        "한 점 싸움이 다시 시작됐고",
        "상대 덕아웃에 숨이 붙었고",
        "우리 쪽 긴장감도 확 올라갔고",
        "불펜과 수비 모두 더 빡빡해졌고",
        "스코어보드가 마음 편한 모양은 아니고",
        "이제 작은 실수 하나도 크게 보이고",
      ],
      [
        "다음 공격에서 바로 다시 가져와야 합니다.",
        "여기서 오래 흔들리면 안 됩니다.",
        "바로 끊고 다시 몰아붙여야 합니다.",
        "팬들 심장도 쉬지 못합니다.",
        "이제부터는 한 공 한 공이 전부입니다.",
        "상대가 더 신나기 전에 눌러야 합니다.",
      ]
    );
  }

  if (ctx.state === "lead") {
    const middle =
      ctx.gap === 1
        ? [
            "아직 앞서지만 한 점 차입니다",
            "살얼음판 리드라 절대 편하지 않습니다",
            "숨 막히는 간격만 남았습니다",
            "앞서 있어도 손에 땀 나는 점수입니다",
            "불안한 한 점을 지켜야 합니다",
            "이제 점수판이 너무 가깝습니다",
          ]
        : [
            `아직 ${ctx.gap}점 차로 앞서지만`,
            "그래도 불씨는 커지기 전에 꺼야 하고",
            "상대가 숨 붙기 전에 끊어야 하고",
            "방금 실점은 바로 정리해야 하고",
            "간격이 줄어든 건 사실이고",
            "수비 쪽 집중력이 다시 필요하고",
          ];
    return combineCopyParts(
      [
        "실점은 아픕니다.",
        "괜히 찝찝한 점수를 줬습니다.",
        "상대가 숨을 붙였습니다.",
        "방금 한 점은 그냥 넘기면 안 됩니다.",
        "흐름이 살짝 흔들렸습니다.",
        "팬들 손에 힘 들어갑니다.",
        "여기서 방심하면 바로 피곤해집니다.",
        "점수판 간격이 줄었습니다.",
      ],
      middle,
      [
        "다음 수비에서 바로 잠가야 합니다.",
        "추가 실점만은 막아야 합니다.",
        "공 하나씩 더 차갑게 가야 합니다.",
        "상대 응원석 소리 커지기 전에 끊읍시다.",
        "바로 다음 아웃카운트가 중요합니다.",
        "우리 공격이 다시 답을 내면 됩니다.",
      ]
    );
  }

  return combineCopyParts(
    [
      "또 내줬습니다.",
      "점수판이 더 멀어졌습니다.",
      "방금 실점은 체감이 큽니다.",
      "지금은 말보다 아웃카운트가 필요합니다.",
      "팬들 한숨 나올 장면입니다.",
      "상대가 너무 편하게 숨 쉬게 두면 안 됩니다.",
      "이 흐름은 바로 잘라야 합니다.",
      "벤치가 답을 꺼내야 할 타이밍입니다.",
    ],
    [
      `현재 ${ctx.gap}점 차이고`,
      "공격에서 다시 불을 붙여야 하고",
      "수비부터 먼저 흔들림을 멈춰야 하고",
      "상대 리듬을 더 키우면 안 되고",
      "다음 이닝까지 끌고 갈 실점은 아니고",
      "지금 필요한 건 깔끔한 정리이고",
    ],
    [
      "바로 다음 장면에서 끊어야 합니다.",
      "이제 알림창도 더 예민하게 봐야 합니다.",
      "아직 경기는 남았습니다.",
      "한 번만 더 흐름을 뺏어오면 됩니다.",
      "팬 모드 꺼질 때가 아닙니다.",
      "다음 공격에서 말이 달라져야 합니다.",
    ]
  );
}

export function buildBiasedLineupCopy(input: {
  teamShort: string;
  starter: string;
  state: PushPulseState;
}): { title: string; body: string } {
  const { teamShort, starter, state } = input;
  const title = pickRandom([
    `${teamShort} 오늘 선발 라인업 확정! ⚾️`,
    `🚨 ${teamShort} 라인업 떴다`,
    `🔥 ${teamShort} 선발 공개`,
  ]);
  const byState: Record<PushPulseState, string[]> = {
    lead: [
      `오늘 선발투수는 ${starter}. 기세 이어서 끝까지 밀어붙이자.`,
      `${starter} 출격. 지금 분위기면 그냥 찢는다.`,
    ],
    trail: [
      `오늘 선발투수는 ${starter}. 지금부터 반격 시나리오 쓴다.`,
      `${starter} 나온다. 오늘 판 뒤집자.`,
    ],
    tie: [
      `오늘 선발투수는 ${starter}. 라인업 보러 가자 🔥`,
      `${starter} 확정. 편파 중계 시작한다.`,
    ],
    comeback: [
      `${starter} 출격. 역전각 제대로 잡혔다.`,
      `오늘은 ${starter}. 역전 드라마 찍으러 간다.`,
    ],
  };
  return { title, body: pickRandom(byState[state]) };
}

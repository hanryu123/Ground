/**
 * KBO 화보 자동 생성기 — Replicate AI
 *
 * 실행 방법:
 *   npm run posters:morning    # 모드: 아침 (06시 크론)
 *   npm run posters:night      # 모드: 밤 (22시 크론, 승패 분기)
 *   npm run posters:dry        # API 호출 없이 프롬프트만 출력 (검증용)
 *
 * 환경변수 (.env.local 또는 GH Secrets):
 *   REPLICATE_API_TOKEN          — 필수
 *   REPLICATE_MODEL_VERSION      — 필수, 예: "user/repo:hashversion"
 *   REPLICATE_API_TRIGGER_WORD   — 선택, 마스터 LoRA 트리거 (기본 "ground")
 *   POSTER_WIDTH / POSTER_HEIGHT — 선택, 기본 832x1216
 *   POSTER_STEPS / POSTER_GUIDANCE — 선택, 기본 30 / 7.5
 *
 * 트리거 합성 (`hanryu123/ground.master` LoRA 전용):
 *   1) master  ("ground")              — env 로 받음, LoRA 본체 활성화
 *   2) team    ("ground.lg" 등)        — TRIGGER_BY_TEAM 매핑 (학습 폴더명)
 *   3) mode    ("ground.victory" 등)   — promptBuilder 내부에서 자동 부착
 *   세 트리거는 프롬프트 맨 앞에 직렬로 들어가 LoRA 토큰 가중치를 최대화.
 *
 * 저장 경로:
 *   morning: public/images/refs/ready/${teamId.toLowerCase()}.jpg
 *   night + winner: public/images/refs/victory/${teamId.toLowerCase()}.jpg
 *   night + loser/no-game: public/images/refs/ready/${teamId.toLowerCase()}.jpg
 *      (밤에도 이긴 게 아니라면 ready 슬롯이 그대로 노출되므로 ready 갱신)
 *
 * 결과 로그:
 *   logs/generation.log  (콘솔 + 파일 동시 기록)
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import Replicate from "replicate";
import sharp from "sharp";

import { TEAM_CONFIG } from "../config/teams";
import { isTeamWinnerToday } from "../config/todayGames";
import { TEAM_PROMPT_META } from "../config/posterPrompts";
import {
  buildPrompt,
  NEGATIVE_PROMPT,
  type PromptMode,
} from "./lib/promptBuilder";
import { appendLog, appendLogBlock, logBoth } from "./lib/log";

// ─── env ───────────────────────────────────────────────────────────
const ROOT = process.cwd();
dotenv.config({ path: path.join(ROOT, ".env.local") });
dotenv.config(); // .env fallback

type Mode = "morning" | "night";
const MODE = (process.env.MODE ?? "morning") as Mode;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

if (MODE !== "morning" && MODE !== "night") {
  console.error(`MODE must be "morning" or "night" (got "${MODE}")`);
  process.exit(1);
}

const TOKEN = process.env.REPLICATE_API_TOKEN;
const MODEL = process.env.REPLICATE_MODEL_VERSION;
const MASTER_TRIGGER = (process.env.REPLICATE_API_TRIGGER_WORD ?? "ground").trim();

/**
 * 팀별 LoRA 트리거 워드 — **학습된 폴더명 그대로** 매핑.
 *
 * `prepare_lora_dataset.py` 가 폴더명을 캡션에 그대로 박았기 때문에,
 * 학습 토큰과 정확히 일치해야 LoRA 효과가 발동한다.
 * dataset/ 폴더명이 들쭉날쭉(공백/대소문자/오타)이라 매핑 테이블로 못박는다.
 *
 * (장기 정리: dataset 폴더명을 정규화 후 재학습하면 이 매핑이 필요없어진다.)
 */
const TRIGGER_BY_TEAM: Record<string, string> = {
  // 정상 매칭
  lg: "ground.lg",
  kia: "ground.kia",
  doosan: "ground.doosan",
  samsung: "ground.samsung",
  // 학습 시 폴더명에 공백 + 첫글자 대문자
  kt: "ground. KT",
  kiwoom: "ground. Kiwoom",
  lotte: "ground. Lotte",
  nc: "ground. NC",
  // 학습 시 첫글자 대문자만
  ssg: "ground.SSG",
  // 학습 시 오타
  hanwha: "ground.Hanhwa",
};

function triggerForTeam(teamId: string): string {
  const id = teamId.toLowerCase();
  return TRIGGER_BY_TEAM[id] ?? `ground.${id}`;
}

const WIDTH = Number(process.env.POSTER_WIDTH ?? 832);
const HEIGHT = Number(process.env.POSTER_HEIGHT ?? 1216);
const STEPS = Number(process.env.POSTER_STEPS ?? 30);
const GUIDANCE = Number(process.env.POSTER_GUIDANCE ?? 7.5);

if (!DRY_RUN) {
  if (!TOKEN) {
    console.error("REPLICATE_API_TOKEN is required (set in .env.local or env).");
    process.exit(1);
  }
  if (!MODEL) {
    console.error(
      'REPLICATE_MODEL_VERSION is required (e.g. "user/repo:versionhash").'
    );
    process.exit(1);
  }
}

// ─── paths ─────────────────────────────────────────────────────────
const READY_DIR = path.join(ROOT, "public/images/refs/ready");
const VICTORY_DIR = path.join(ROOT, "public/images/refs/victory");

// ─── helpers ───────────────────────────────────────────────────────

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

/**
 * Replicate SDK 의 다양한 출력 형태 흡수 (string / string[] / FileOutput).
 */
async function urlFromOutput(output: unknown): Promise<string> {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) {
    return urlFromOutput(output[0]);
  }
  if (output && typeof output === "object") {
    const o = output as { url?: () => URL | string };
    if (typeof o.url === "function") {
      const u = o.url();
      return typeof u === "string" ? u : u.toString();
    }
  }
  throw new Error(
    `unexpected output shape: ${JSON.stringify(output).slice(0, 200)}`
  );
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed (HTTP ${res.status}) for ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * sharp 로 mozjpeg 최적화 — 90% 품질, 점진 인코딩, 메타 제거.
 * 일반적으로 SDXL 출력 1.5~3MB → 200~400KB 수준으로 줄어든다.
 */
async function optimizeJpeg(buf: Buffer): Promise<Buffer> {
  return sharp(buf, { failOn: "none" })
    .rotate() // EXIF 회전 보정
    .jpeg({ quality: 88, mozjpeg: true, progressive: true })
    .withMetadata({ exif: undefined })
    .toBuffer();
}

function pickPromptMode(teamId: string): PromptMode {
  if (MODE === "morning") return "morning";
  return isTeamWinnerToday(teamId) ? "night-victory" : "night-default";
}

function pickOutputPath(teamId: string): string {
  const file = `${teamId.toLowerCase()}.jpg`;
  if (MODE === "night" && isTeamWinnerToday(teamId)) {
    return path.join(VICTORY_DIR, file);
  }
  return path.join(READY_DIR, file);
}

// ─── core: generate one team ───────────────────────────────────────

type Result = {
  teamId: string;
  promptMode: PromptMode;
  ok: boolean;
  outPath?: string;
  bytes?: number;
  error?: string;
  durationMs?: number;
};

async function generateOne(
  replicate: Replicate | null,
  teamId: string
): Promise<Result> {
  const meta = TEAM_PROMPT_META[teamId];
  if (!meta) {
    return {
      teamId,
      promptMode: "morning",
      ok: false,
      error: `no prompt meta for "${teamId}"`,
    };
  }

  const promptMode = pickPromptMode(teamId);
  const outPath = pickOutputPath(teamId);
  const triggerWord = triggerForTeam(teamId);
  const prompt = buildPrompt({
    teamId,
    mode: promptMode,
    meta,
    triggerWord,
    masterTrigger: MASTER_TRIGGER,
  });

  if (DRY_RUN || !replicate) {
    await appendLogBlock([
      `[DRY] ${teamId} (${promptMode}) → ${path.relative(ROOT, outPath)}`,
      `[DRY] prompt: ${prompt}`,
    ]);
    console.log(`[${teamId}] DRY → ${path.relative(ROOT, outPath)}`);
    console.log(`        ${prompt}`);
    return { teamId, promptMode, ok: true, outPath };
  }

  const t0 = Date.now();
  try {
    await ensureDir(path.dirname(outPath));

    const output = await replicate.run(
      MODEL as `${string}/${string}:${string}`,
      {
        input: {
          prompt,
          negative_prompt: NEGATIVE_PROMPT,
          width: WIDTH,
          height: HEIGHT,
          num_inference_steps: STEPS,
          guidance_scale: GUIDANCE,
          // 일부 SDXL 변형은 num_outputs / scheduler 등 추가 키를 지원하지만,
          // 모델별 인풋 스키마가 다르므로 보수적으로 핵심 키만 보낸다.
        },
      }
    );

    const url = await urlFromOutput(output);
    const raw = await downloadBuffer(url);
    const optimized = await optimizeJpeg(raw);
    await fs.writeFile(outPath, optimized);

    const durationMs = Date.now() - t0;
    return {
      teamId,
      promptMode,
      ok: true,
      outPath,
      bytes: optimized.byteLength,
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - t0;
    return {
      teamId,
      promptMode,
      ok: false,
      outPath,
      error: e instanceof Error ? e.message : String(e),
      durationMs,
    };
  }
}

// ─── main ──────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  const header = [
    `==============================================================`,
    `Poster generation start: ${startedAt.toISOString()}`,
    `mode=${MODE}  dryRun=${DRY_RUN}`,
    `trigger=master:"${MASTER_TRIGGER}" + per-team(TRIGGER_BY_TEAM) + per-mode(MODE_TRIGGER)`,
    `model=${MODEL ?? "(unset)"}`,
    `output: ${WIDTH}x${HEIGHT}, steps=${STEPS}, guidance=${GUIDANCE}`,
    `==============================================================`,
  ];
  console.log(header.join("\n"));
  await appendLogBlock(header);

  const replicate =
    DRY_RUN || !TOKEN ? null : new Replicate({ auth: TOKEN! });

  const teamIds = Object.keys(TEAM_CONFIG);
  const results: Result[] = [];

  // 직렬 처리 — Replicate 동시 호출 폭주 방지 + rate limit 안전
  for (const teamId of teamIds) {
    process.stdout.write(`[${teamId}] generating...\n`);
    const r = await generateOne(replicate, teamId);
    results.push(r);

    if (r.ok) {
      const sizeLabel = r.bytes ? `${(r.bytes / 1024).toFixed(0)}KB` : "—";
      const durLabel = r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—";
      const rel = r.outPath ? path.relative(ROOT, r.outPath) : "—";
      const line = `[${teamId}] OK  (${r.promptMode}) → ${rel}  [${sizeLabel}, ${durLabel}]`;
      await logBoth(line);
    } else {
      const line = `[${teamId}] FAIL (${r.promptMode}) → ${r.error}`;
      await logBoth(line);
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const finishedAt = new Date();
  const totalSec = ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);

  const footer = [
    `--------------------------------------------------------------`,
    `Done: ${ok} ok / ${fail} fail / ${results.length} total`,
    `Elapsed: ${totalSec}s   finished=${finishedAt.toISOString()}`,
    `==============================================================`,
    "",
  ];
  console.log(footer.join("\n"));
  await appendLogBlock(footer);

  // 실패가 하나라도 있으면 exit 1 (CI가 빨갛게 표시되도록)
  if (fail > 0) process.exit(1);
}

// ESM에서도 안전하게 "직접 실행"인지 판별
const __filename = fileURLToPath(import.meta.url);
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  main().catch(async (e) => {
    const msg = e instanceof Error ? e.stack || e.message : String(e);
    console.error(msg);
    await appendLog(`FATAL: ${msg}`);
    process.exit(1);
  });
}

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import Replicate from "replicate";
import sharp from "sharp";

import { TEAM_CONFIG } from "@/config/teams";
import { TEAM_PROMPT_META } from "@/config/posterPrompts";
import {
  buildPrompt,
  type PromptMode,
  type PromptStylePreset,
} from "@/scripts/lib/promptBuilder";
import { fetchKboTodayGames, getTeamGame } from "@/lib/kbo";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROOT = process.cwd();
const READY_DIR = path.join(ROOT, "public", "images", "refs", "ready");
const UNIFORM_DIR = path.join(ROOT, "public", "images", "refs", "uniforms");

const TOKEN = process.env.REPLICATE_API_TOKEN;
const MODEL = process.env.REPLICATE_MODEL_VERSION;
const MASTER_TRIGGER = (process.env.REPLICATE_API_TRIGGER_WORD ?? "ground").trim();

const STEPS = Number(process.env.POSTER_STEPS ?? 50);
const GUIDANCE = Number(process.env.POSTER_GUIDANCE ?? 4.5);
const ASPECT_RATIO = process.env.POSTER_ASPECT ?? "9:16";
const LORA_SCALE = Number(process.env.POSTER_LORA_SCALE ?? 1.0);
const MEGAPIXELS = (process.env.POSTER_MEGAPIXELS ?? "1") as "1" | "0.25";
const PROMPT_STRENGTH = Number(process.env.POSTER_PROMPT_STRENGTH ?? 1.0);

const UPSCALE_ENABLED = process.env.POSTER_UPSCALE !== "0";
const UPSCALE_MODEL =
  "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";
const UPSCALE_FACTOR = Number(process.env.POSTER_UPSCALE_FACTOR ?? 4);

const FACE_SHADOW_ENABLED = process.env.POSTER_FACE_SHADOW !== "0";
const FACE_SHADOW_STRENGTH = Math.max(
  0,
  Math.min(0.9, Number(process.env.POSTER_FACE_SHADOW ?? 0.55))
);

const TRIGGER_BY_TEAM: Record<string, string> = {
  lg: "ground.lg",
  kia: "ground.kia",
  doosan: "ground.doosan",
  samsung: "ground.samsung",
  kt: "ground. KT",
  kiwoom: "ground. Kiwoom",
  lotte: "ground. Lotte",
  nc: "ground. NC",
  ssg: "ground.SSG",
  hanwha: "ground.Hanhwa",
};

function triggerForTeam(teamId: string): string {
  const id = teamId.toLowerCase();
  return TRIGGER_BY_TEAM[id] ?? `ground.${id}`;
}

async function loadUniformDataUri(teamId: string): Promise<string | null> {
  const file = path.join(UNIFORM_DIR, `${teamId.toLowerCase()}.jpg`);
  try {
    const buf = await fs.readFile(file);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function urlFromOutput(output: unknown): Promise<string> {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) return urlFromOutput(output[0]);
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
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function applyFaceShadow(buf: Buffer): Promise<Buffer> {
  if (!FACE_SHADOW_ENABLED || FACE_SHADOW_STRENGTH <= 0) return buf;
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 832;
  const h = meta.height ?? 1216;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="black" stop-opacity="${FACE_SHADOW_STRENGTH.toFixed(3)}"/>
      <stop offset="22%" stop-color="black" stop-opacity="${(FACE_SHADOW_STRENGTH * 0.6).toFixed(3)}"/>
      <stop offset="38%" stop-color="black" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
</svg>`;
  return sharp(buf, { failOn: "none" })
    .composite([{ input: Buffer.from(svg), blend: "multiply" }])
    .toBuffer();
}

async function optimizeJpeg(buf: Buffer, upscaled = false): Promise<Buffer> {
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  let pipeline = sharp(buf, { failOn: "none" }).rotate();
  if (upscaled && meta.width && meta.width > 2048) {
    pipeline = pipeline.resize({
      width: 2048,
      withoutEnlargement: true,
      kernel: "lanczos3",
    });
  }
  return pipeline
    .jpeg({ quality: upscaled ? 92 : 88, mozjpeg: true, progressive: true })
    .withMetadata({ exif: undefined })
    .toBuffer();
}

type GenerateBody = {
  teamId?: string;
  mode?: PromptMode;
  stylePreset?: PromptStylePreset;
};

/**
 * POST /api/admin/generate
 * body: {
 *   teamId: "LG" | "KIA" | ...,
 *   mode?: "morning" | "night-victory" | "night-default",
 *   stylePreset?: "balanced" | "anime-boost" | "uniform-realism"
 * }
 *
 * 선택 팀 1장의 AI 화보를 생성해서 /public/images/refs/ready/<teamId>.jpg 로 즉시 교체한다.
 */
export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!TOKEN || !MODEL) {
    return NextResponse.json(
      { error: "REPLICATE_API_TOKEN / REPLICATE_MODEL_VERSION required" },
      { status: 500 }
    );
  }

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const key = (body.teamId ?? "").trim().toUpperCase();
  if (!key || !TEAM_CONFIG[key]) {
    return NextResponse.json({ error: `unknown teamId: ${body.teamId}` }, { status: 400 });
  }
  const promptMode: PromptMode =
    body.mode === "night-victory" || body.mode === "night-default"
      ? body.mode
      : "morning";
  const stylePreset: PromptStylePreset =
    body.stylePreset === "anime-boost" || body.stylePreset === "uniform-realism"
      ? body.stylePreset
      : "balanced";

  const teamId = key.toLowerCase();
  const meta = TEAM_PROMPT_META[key];
  if (!meta) {
    return NextResponse.json({ error: `no prompt meta: ${key}` }, { status: 400 });
  }

  const liveGames = await fetchKboTodayGames().catch(() => []);
  const liveView = getTeamGame(liveGames, teamId);
  const prompt = buildPrompt({
    teamId,
    mode: promptMode,
    stylePreset,
    meta,
    triggerWord: triggerForTeam(teamId),
    masterTrigger: MASTER_TRIGGER,
    starterName: liveView?.starter ?? null,
  });

  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: ASPECT_RATIO,
    megapixels: MEGAPIXELS,
    num_inference_steps: STEPS,
    guidance_scale: GUIDANCE,
    lora_scale: LORA_SCALE,
    output_format: "jpg",
    output_quality: 100,
    num_outputs: 1,
  };
  const uniformImage = await loadUniformDataUri(teamId);
  if (uniformImage) {
    input.image = uniformImage;
    input.prompt_strength = PROMPT_STRENGTH;
  }

  try {
    const replicate = new Replicate({ auth: TOKEN });
    const output = await replicate.run(MODEL as `${string}/${string}:${string}`, {
      input,
    });
    const generatedUrl = await urlFromOutput(output);

    let finalUrl = generatedUrl;
    let upscaled = false;
    if (UPSCALE_ENABLED) {
      try {
        const up = await replicate.run(
          UPSCALE_MODEL as `${string}/${string}:${string}`,
          { input: { image: generatedUrl, scale: UPSCALE_FACTOR, face_enhance: true } }
        );
        finalUrl = await urlFromOutput(up);
        upscaled = true;
      } catch {
        // 업스케일 실패는 non-fatal: 원본으로 계속 진행.
      }
    }

    const raw = await downloadBuffer(finalUrl);
    const shaded = await applyFaceShadow(raw);
    const optimized = await optimizeJpeg(shaded, upscaled);

    await fs.mkdir(READY_DIR, { recursive: true });
    const target = path.join(READY_DIR, `${teamId}.jpg`);
    await fs.writeFile(target, optimized);

    const st = await fs.stat(target);
    const mtimeMs = Math.floor(st.mtimeMs);
    return NextResponse.json({
      ok: true,
      teamId: key,
      readyFile: `${teamId}.jpg`,
      publicUrl: `/images/refs/ready/${teamId}.jpg?v=${mtimeMs}`,
      sizeBytes: st.size,
      mtimeMs,
      mode: promptMode,
      stylePreset,
      starter: liveView?.starter ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "generation failed" },
      { status: 500 }
    );
  }
}


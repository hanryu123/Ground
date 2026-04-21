import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { TEAM_CONFIG } from "@/config/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 50MB 까지 받음 (RAW 풀화질 업로드 대비)
export const maxDuration = 60;

const READY_DIR = path.join(process.cwd(), "public", "images", "refs", "ready");
const READY_EXTS = ["jpg", "jpeg", "png", "webp"];
const ACCEPT_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_BYTES = 50 * 1024 * 1024;
/** 메인 화면 9:16 카드 기준 — 가로 2048px 로 정규화. 원본보다 크진 않게. */
const TARGET_WIDTH = 2048;

/**
 * POST /api/admin/upload
 *   multipart/form-data
 *     teamId : "LG" | "KIA" | ...
 *     file   : image binary (jpg | png | webp)
 *
 *  → public/images/refs/ready/<teamId>.jpg 로 덮어쓰기 (이 요청 한 번이 곧 프로덕션 반영)
 *  → 다른 확장자(.png/.webp/.jpeg) 잔존 파일은 동시에 정리해서 충돌 방지
 *
 *  ⚠ Vercel serverless 환경에서 public/ 는 read-only 라 운영 배포에서는 동작하지 않는다.
 *    로컬 dev 서버 / 자체 호스팅 / Volume mount 환경 전용. (사장님이 로컬 검증 요청)
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form" }, { status: 400 });
  }

  const teamIdRaw = form.get("teamId");
  const file = form.get("file");

  if (typeof teamIdRaw !== "string" || !teamIdRaw) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }
  const teamId = teamIdRaw.toUpperCase();
  if (!TEAM_CONFIG[teamId]) {
    return NextResponse.json({ error: `unknown teamId: ${teamId}` }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (!ACCEPT_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported mime: ${file.type}` },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (${file.size} > ${MAX_BYTES})` },
      { status: 413 }
    );
  }

  const inputBuf = Buffer.from(await file.arrayBuffer());

  // sharp 로 표준화: 9:16 비율 안 깨고, 가로폭만 2048 로 다운스케일 (업스케일은 안 함).
  // metadata 다 털고 progressive jpeg 로 저장.
  let optimized: Buffer;
  try {
    const meta = await sharp(inputBuf).metadata();
    const srcWidth = meta.width ?? TARGET_WIDTH;
    const targetWidth = Math.min(TARGET_WIDTH, srcWidth);
    optimized = await sharp(inputBuf, { failOn: "none" })
      .rotate() // EXIF orientation 보정
      .resize({ width: targetWidth, withoutEnlargement: true, kernel: "lanczos3" })
      .jpeg({ quality: 92, progressive: true, mozjpeg: true })
      .withMetadata({})
      .toBuffer();
  } catch (err) {
    return NextResponse.json(
      { error: `image processing failed: ${(err as Error).message}` },
      { status: 422 }
    );
  }

  // 디렉토리 보장
  await fs.mkdir(READY_DIR, { recursive: true });

  // 동일 teamId 의 다른 확장자 파일은 충돌 방지 차원에서 제거
  const lower = teamId.toLowerCase();
  await Promise.all(
    READY_EXTS.map(async (ext) => {
      if (ext === "jpg") return;
      const stale = path.join(READY_DIR, `${lower}.${ext}`);
      try {
        await fs.rm(stale, { force: true });
      } catch {
        // ignore
      }
    })
  );

  const target = path.join(READY_DIR, `${lower}.jpg`);
  await fs.writeFile(target, optimized);

  const st = await fs.stat(target);
  const mtimeMs = Math.floor(st.mtimeMs);
  return NextResponse.json({
    ok: true,
    teamId,
    readyFile: `${lower}.jpg`,
    publicUrl: `/images/refs/ready/${lower}.jpg?v=${mtimeMs}`,
    sizeBytes: st.size,
    mtimeMs,
  });
}

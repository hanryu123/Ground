import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { TEAM_CONFIG } from "@/config/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READY_DIR = path.join(process.cwd(), "public", "images", "refs", "ready");
const READY_EXTS = ["jpg", "jpeg", "png", "webp"] as const;

type TeamRow = {
  teamId: string;
  fullName: string;
  /** 디스크에 떨어져 있는 현재 ready 파일 (없으면 null) */
  readyFile: string | null;
  /** 메인 화면이 실제로 fetch 할 public path (cache-bust 용 ?v=mtime 포함) */
  publicUrl: string | null;
  sizeBytes: number | null;
  mtimeMs: number | null;
};

async function statTeam(teamId: string): Promise<{
  readyFile: string | null;
  sizeBytes: number | null;
  mtimeMs: number | null;
}> {
  const lower = teamId.toLowerCase();

  for (const ext of READY_EXTS) {
    const fname = `${lower}.${ext}`;
    const abs = path.join(READY_DIR, fname);
    try {
      const st = await fs.stat(abs);
      if (st.isFile()) {
        return {
          readyFile: fname,
          sizeBytes: st.size,
          mtimeMs: Math.floor(st.mtimeMs),
        };
      }
    } catch {
      // continue
    }
  }
  return { readyFile: null, sizeBytes: null, mtimeMs: null };
}

/** GET /api/admin/teams → 10팀의 현 ready 상태 스냅샷 */
export async function GET() {
  const ids = Object.keys(TEAM_CONFIG);
  const rows: TeamRow[] = await Promise.all(
    ids.map(async (id) => {
      const cfg = TEAM_CONFIG[id];
      const stat = await statTeam(id);
      const publicUrl = stat.readyFile
        ? `/images/refs/ready/${stat.readyFile}?v=${stat.mtimeMs ?? 0}`
        : null;
      return {
        teamId: id,
        fullName: cfg.fullName,
        readyFile: stat.readyFile,
        publicUrl,
        sizeBytes: stat.sizeBytes,
        mtimeMs: stat.mtimeMs,
      };
    })
  );

  return NextResponse.json({ teams: rows });
}

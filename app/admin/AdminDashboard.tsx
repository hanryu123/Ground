"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TeamRow = {
  teamId: string;
  fullName: string;
  readyFile: string | null;
  publicUrl: string | null;
  sizeBytes: number | null;
  mtimeMs: number | null;
};

function formatKB(b: number | null): string {
  if (b == null) return "—";
  return b > 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(b / 1024)} KB`;
}

function formatAgo(ms: number | null): string {
  if (!ms) return "비어 있음";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금 전";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  return `${Math.floor(diff / 86400_000)}일 전`;
}

export function AdminDashboard() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/teams", { cache: "no-store" });
      if (!res.ok) throw new Error(`fetch teams ${res.status}`);
      const j = (await res.json()) as { teams: TeamRow[] };
      setTeams(j.teams);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function logout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    window.location.reload();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white antialiased">
      {/* Top bar */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-neutral-950/70 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-[11px] tracking-[0.35em] text-neutral-500">
              GROUND
            </div>
            <div className="text-base font-semibold tracking-tight">
              Control Tower
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void reload()}
              className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 transition"
            >
              새로고침
            </button>
            <button
              onClick={() => void logout()}
              className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            메인 화면 큐레이션
          </h1>
          <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
            아래 카드의 [업로드 → Publish] 한 번이면, 유저가 보는 메인 화면의
            해당 팀 화보가 즉시 교체됩니다.
            <br />
            현재 출력 경로: <code className="text-neutral-300">/images/refs/ready/&lt;teamId&gt;.jpg</code>
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <SkeletonGrid />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {teams.map((t) => (
              <TeamCard
                key={t.teamId}
                row={t}
                onUploaded={(updated) => {
                  setTeams((prev) =>
                    prev.map((p) => (p.teamId === updated.teamId ? updated : p))
                  );
                  showToast(`${updated.teamId} 메인 출력 완료`);
                }}
                onError={(msg) => showToast(`실패: ${msg}`)}
              />
            ))}
          </div>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white text-black text-xs font-medium px-5 py-3 shadow-2xl">
          {toast}
        </div>
      )}
    </main>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[9/16] rounded-2xl bg-neutral-900 animate-pulse border border-white/5"
        />
      ))}
    </div>
  );
}

function TeamCard({
  row,
  onUploaded,
  onError,
}: {
  row: TeamRow;
  onUploaded: (r: TeamRow) => void;
  onError: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function uploadFile(file: File) {
    if (!file) return;
    setBusy(true);
    setProgress("업로드 중…");
    try {
      const fd = new FormData();
      fd.append("teamId", row.teamId);
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `${res.status}`);
      }
      const updated = (await res.json()) as TeamRow & { ok: true };
      onUploaded({
        teamId: updated.teamId,
        fullName: row.fullName,
        readyFile: updated.readyFile,
        publicUrl: updated.publicUrl,
        sizeBytes: updated.sizeBytes,
        mtimeMs: updated.mtimeMs,
      });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void uploadFile(f);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void uploadFile(f);
  }

  return (
    <div
      className="group rounded-2xl border border-white/10 bg-neutral-900/60 overflow-hidden flex flex-col hover:border-white/25 transition"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="relative aspect-[9/16] bg-neutral-950">
        {row.publicUrl ? (
          // 정적 public asset 이라 next/image 대신 <img> 로 즉시 교체 (cache-bust ?v=mtime)
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.publicUrl}
            alt={row.fullName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-600 text-sm">
            아직 화보 없음
          </div>
        )}

        {/* 상단 팀 라벨 */}
        <div className="absolute left-3 top-3 px-2 py-1 rounded-md bg-black/50 backdrop-blur text-[10px] tracking-widest text-white">
          {row.teamId}
        </div>

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-neutral-200">
            {progress ?? "처리 중…"}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div>
          <div className="text-sm font-medium tracking-tight">{row.fullName}</div>
          <div className="mt-1 text-[11px] text-neutral-500 tabular-nums">
            {row.readyFile ? `${row.readyFile} · ` : ""}
            {formatKB(row.sizeBytes)} · {formatAgo(row.mtimeMs)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onFileChosen}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex-1 rounded-lg bg-white text-black text-xs font-medium py-2.5 hover:bg-neutral-200 transition disabled:opacity-40"
          >
            업로드 → Publish
          </button>
          {row.publicUrl && (
            <a
              href={row.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/10 px-3 py-2.5 text-xs text-neutral-300 hover:border-white/30 transition"
            >
              원본
            </a>
          )}
        </div>

        <div className="text-[10px] text-neutral-600 leading-relaxed">
          파일을 카드에 드롭해도 됩니다 · jpg/png/webp · 최대 50MB · 자동으로
          2048px 와이드 progressive JPEG 로 변환되어 메인에 즉시 반영됩니다.
        </div>
      </div>
    </div>
  );
}

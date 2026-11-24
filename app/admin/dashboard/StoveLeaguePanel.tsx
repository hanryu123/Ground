"use client";

import { useState } from "react";
import { listStoveLeagueCandidates, sendStoveLeagueAlert, type StoveLeagueRow } from "./actions";
import { findTeam } from "@/lib/teams";

type TestDevice = { id: string; label: string; detail: string };

/**
 * 스토브리그 알림 — 최근 이틀 우리 팀 FA·트레이드·계약 기사 후보를 팀별로 보여 주고,
 * 테스트(내 기기) / 실제 발송(그 팀 팬 전체)을 직접 누른다. 같은 기사는 한 번만 나간다.
 */
export default function StoveLeaguePanel({ testDevices }: { testDevices: TestDevice[] }) {
  const [rows, setRows] = useState<StoveLeagueRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testDeviceId, setTestDeviceId] = useState(testDevices[0]?.id ?? "");

  async function load() {
    setLoading(true);
    setMessage(null);
    const res = await listStoveLeagueCandidates();
    setLoading(false);
    if (res.ok) setRows(res.rows);
    else setMessage(`불러오기 실패: ${res.error}`);
  }

  async function send(teamId: string, item: StoveLeagueRow["items"][number], testOnly: boolean) {
    const team = findTeam(teamId);
    if (!testOnly && !window.confirm(`${team.short} 팬 전체에게 보낼까요?\n\n${item.pushTitle}\n${item.pushBody}`)) return;
    const key = `${teamId}:${item.id}:${testOnly ? "t" : "r"}`;
    setBusy(key);
    setMessage(null);
    const res = await sendStoveLeagueAlert({
      teamId,
      newsId: item.id,
      title: item.pushTitle,
      body: item.pushBody,
      testOnly,
      testNativeTokenId: testOnly ? testDeviceId || null : null,
    });
    setBusy(null);
    setMessage(res.ok ? `${testOnly ? "테스트" : team.short} 발송 완료 · ${res.sent}명` : `발송 실패: ${res.error}`);
    if (res.ok && !testOnly) await load();
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">스토브리그 알림</h2>
          <p className="mt-1 text-xs text-slate-400">최근 이틀 FA·트레이드·외국인·계약·코칭스태프·방출 기사. 자동 발송 없음 — 골라서 보내요.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={testDeviceId}
            onChange={(e) => setTestDeviceId(e.target.value)}
            className="max-w-[260px] rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
            aria-label="테스트 받을 기기"
          >
            {testDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 disabled:opacity-50"
          >
            {loading ? "불러오는 중…" : rows ? "새로고침" : "후보 불러오기"}
          </button>
        </div>
      </div>

      {message ? <p className="mt-3 text-xs text-amber-300">{message}</p> : null}

      {rows ? (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <div key={row.teamId} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
              <p className="text-sm font-semibold text-white">{findTeam(row.teamId).name}</p>
              {row.items.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">최근 이틀 스토브리그 기사 없음</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {row.items.map((item) => (
                    <li key={item.id} className="rounded-lg bg-white/[0.03] p-2.5">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">{item.tag}</span>
                        <span>{item.dateTime.slice(5, 16).replace("T", " ")}</span>
                        {item.sent ? <span className="text-emerald-300">보냄</span> : null}
                      </div>
                      <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-slate-300 underline-offset-2 hover:underline">
                        {item.title}
                      </a>
                      <p className="mt-1.5 text-xs text-white">
                        <b>{item.pushTitle}</b> · {item.pushBody}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void send(row.teamId, item, true)}
                          disabled={busy !== null || !testDeviceId}
                          className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-slate-200 disabled:opacity-40"
                        >
                          테스트
                        </button>
                        <button
                          type="button"
                          onClick={() => void send(row.teamId, item, false)}
                          disabled={busy !== null || item.sent}
                          className="rounded-md bg-rose-500 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                        >
                          {item.sent ? "보냄" : `${findTeam(row.teamId).short} 팬에게 보내기`}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

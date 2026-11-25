import { getPushEffect, type PushEffectRow } from "@/lib/pushMetrics";
import { CASTER_STYLES } from "@/lib/notifications/casterStyle";
import { findTeam } from "@/lib/teams";

/**
 * 알림 효과 — 최근 30일, 보낸 알림 중 몇 명이 눌러서 앱을 열었는지.
 * 기록은 이 기능이 배포된 뒤 보낸 알림부터 쌓인다 (그전 알림은 링크에 묶음 ID 가 없다).
 */

const KIND_LABEL: Record<string, string> = {
  score: "득점",
  live: "실시간(홈런·삼진·투수교체)",
  pitcher: "선발투수",
  preview: "프리뷰",
  report: "경기 리포트",
  highlight: "하이라이트",
  "stove-league": "스토브리그",
  other: "기타",
};

function rate(row: { sent: number; opened: number }): string {
  if (row.sent === 0) return "–";
  return `${((row.opened / row.sent) * 100).toFixed(1)}%`;
}

function Table({ title, rows, label }: { title: string; rows: PushEffectRow[]; label: (key: string) => string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-sm font-semibold text-white">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">아직 기록 없음</p>
      ) : (
        <table className="mt-2 w-full text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="py-1 text-left font-normal">구분</th>
              <th className="py-1 text-right font-normal">묶음</th>
              <th className="py-1 text-right font-normal">보냄</th>
              <th className="py-1 text-right font-normal">열람</th>
              <th className="py-1 text-right font-normal">열람률</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-white/5">
                <td className="py-1.5">{label(r.key)}</td>
                <td className="py-1.5 text-right tabular-nums">{r.batches}</td>
                <td className="py-1.5 text-right tabular-nums">{r.sent}</td>
                <td className="py-1.5 text-right tabular-nums">{r.opened}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-white">{rate(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function PushEffectSection() {
  let data: Awaited<ReturnType<typeof getPushEffect>> | null = null;
  let error: string | null = null;
  try {
    data = await getPushEffect(30);
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-white">알림 효과 (최근 30일)</h2>
      <p className="mt-1 text-xs text-slate-400">
        알림을 눌러 앱을 연 사람 수 ÷ 보낸 수. 한 알림을 여러 번 열어도 한 번으로 셉니다. 말투별은 득점 알림만.
      </p>
      {error ? <p className="mt-3 text-xs text-amber-300">불러오기 실패: {error}</p> : null}
      {data ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Table title="알림 종류별" rows={data.byKind} label={(k) => KIND_LABEL[k] ?? k} />
            <Table title="득점 알림 말투별" rows={data.byStyle} label={(k) => CASTER_STYLES.find((s) => s.id === k)?.label ?? k} />
          </div>
          {data.recent.length > 0 ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/60 p-3">
              <p className="text-sm font-semibold text-white">최근 보낸 알림</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {data.recent.map((b) => (
                  <li key={b.id} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-slate-500">
                      {new Date(b.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="w-20 shrink-0">{KIND_LABEL[b.kind] ?? b.kind}</span>
                    <span className="w-10 shrink-0 text-slate-400">{b.teamId ? findTeam(b.teamId).short : "양팀"}</span>
                    <span className="min-w-0 flex-1 truncate">{b.title}</span>
                    <span className="shrink-0 tabular-nums">
                      {b.opened}/{b.sent} · <b className="text-white">{rate(b)}</b>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

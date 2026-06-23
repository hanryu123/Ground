"use client";

import { useState, useTransition } from "react";
import { estimateMarketingPushTargets, sendMarketingPush } from "./actions";

type Team = { id: string; name: string; short: string };
type TestDevice = {
  id: string;
  label: string;
  detail: string;
};

type Props = {
  adminKey: string;
  teams: Team[];
  testDevices: TestDevice[];
};

type SendState = "idle" | "sending" | "done" | "error";

export default function PushSenderForm({ adminKey: _adminKey, teams, testDevices }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/today");
  const [targetTeamId, setTargetTeamId] = useState<string>("");
  const [testNativeTokenId, setTestNativeTokenId] = useState(testDevices[0]?.id ?? "");
  const [state, setState] = useState<SendState>("idle");
  const [testState, setTestState] = useState<SendState>("idle");
  const [result, setResult] = useState<{ sentCount?: number; error?: string } | null>(null);
  const [estimate, setEstimate] = useState<{ count?: number; error?: string; loading: boolean }>({ loading: false });
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [realSendConfirmed, setRealSendConfirmed] = useState(false);
  const [, startTransition] = useTransition();

  const refreshEstimate = (testOnly = false) => {
    setEstimate({ loading: true });
    startTransition(async () => {
      const res = await estimateMarketingPushTargets({
        targetTeamId: targetTeamId || null,
        testOnly,
        testNativeTokenId: testOnly ? testNativeTokenId || null : null,
      });
      if (res.ok) setEstimate({ count: res.count, loading: false });
      else setEstimate({ error: res.error, loading: false });
    });
  };

  const send = (testOnly: boolean) => {
    const setter = testOnly ? setTestState : setState;
    setter("sending");
    setResult(null);

    startTransition(async () => {
      const res = await sendMarketingPush({
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || "/today",
        targetTeamId: targetTeamId || null,
        testOnly,
        testNativeTokenId: testOnly ? testNativeTokenId || null : null,
      });

      if (res.ok) {
        setter("done");
        setResult({ sentCount: res.sentCount });
        if (testOnly) setTestConfirmed(true);
        if (!testOnly) {
          setRealSendConfirmed(false);
          setTestConfirmed(false);
        }
      } else {
        setter("error");
        setResult({ error: res.error });
      }
      setTimeout(() => setter("idle"), 4000);
    });
  };

  const isValid = title.trim().length > 0 && body.trim().length > 0;

  const targetLabel = targetTeamId
    ? (teams.find((t) => t.id === targetTeamId)?.name ?? targetTeamId)
    : "전체 유저";
  const realSendDisabled = !isValid || state === "sending" || !testConfirmed || !realSendConfirmed;
  const testSendDisabled = !isValid || testState === "sending" || !testNativeTokenId;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-white">수동 푸시 발송기</h2>
      <p className="mt-1 text-xs text-slate-400">
        미리보기 → 내 폰 테스트 → 실제 발송 확인 순서로 진행합니다. 클릭 트래킹 URL이 자동으로 삽입됩니다.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            알림 제목
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTestConfirmed(false);
              setRealSendConfirmed(false);
            }}
            placeholder="예: ⚾ LG 오늘도 잡자!"
            maxLength={80}
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-white/25 focus:ring-1 focus:ring-white/15"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            알림 본문
          </label>
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setTestConfirmed(false);
              setRealSendConfirmed(false);
            }}
            placeholder="예: 오늘 18:30 롯데전. 한 줄로 끝내자."
            rows={2}
            maxLength={200}
            className="w-full resize-none rounded-lg border border-white/10 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-white/25 focus:ring-1 focus:ring-white/15"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            이동 URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setTestConfirmed(false);
              setRealSendConfirmed(false);
            }}
            placeholder="/today"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-white/25 focus:ring-1 focus:ring-white/15"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            발송 대상
          </label>
          <select
            value={targetTeamId}
            onChange={(e) => {
              setTargetTeamId(e.target.value);
              setTestConfirmed(false);
              setRealSendConfirmed(false);
              setEstimate({ loading: false });
            }}
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3.5 py-2.5 text-sm text-white outline-none focus:border-white/25 focus:ring-1 focus:ring-white/15"
          >
            <option value="">전체 유저</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            테스트 디바이스
          </label>
          <select
            value={testNativeTokenId}
            onChange={(e) => {
              setTestNativeTokenId(e.target.value);
              setTestConfirmed(false);
              setRealSendConfirmed(false);
              setEstimate({ loading: false });
            }}
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3.5 py-2.5 text-sm text-white outline-none focus:border-white/25 focus:ring-1 focus:ring-white/15"
          >
            {testDevices.length === 0 ? (
              <option value="">등록된 iOS 디바이스 없음</option>
            ) : (
              testDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))
            )}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            {testDevices.find((device) => device.id === testNativeTokenId)?.detail
              ?? "폰에서 앱을 열면 테스트 디바이스가 등록됩니다."}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Push Preview</p>
              <p className="mt-1 text-[11px] text-slate-500">실제 유저가 보게 될 알림 문구입니다.</p>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-300">
              {targetLabel}
            </span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/55 p-4 shadow-[0_14px_34px_rgba(0,0,0,0.28)]">
            <p className="text-sm font-bold text-white">{title.trim() || "알림 제목을 입력하세요"}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{body.trim() || "알림 본문을 입력하면 여기에 미리 보입니다."}</p>
            <p className="mt-3 truncate text-[11px] text-slate-500">이동: {url.trim() || "/today"}</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Audience Guard</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => refreshEstimate(false)}
              className="rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
            >
              예상 수신자 계산
            </button>
            <button
              type="button"
              onClick={() => refreshEstimate(true)}
              className="rounded-lg border border-violet-500/30 bg-violet-950/40 px-3 py-2 text-xs font-semibold text-violet-200 transition hover:bg-violet-900/50"
            >
              테스트 대상 확인
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-white/8 bg-slate-900/70 px-3 py-2">
            {estimate.loading ? (
              <p className="text-sm text-slate-400">계산 중...</p>
            ) : estimate.error ? (
              <p className="text-sm text-red-300">{estimate.error}</p>
            ) : typeof estimate.count === "number" ? (
              <p className="text-sm text-slate-200">
                예상 수신자 <span className="font-bold text-white">{estimate.count.toLocaleString("ko-KR")}명</span>
              </p>
            ) : (
              <p className="text-sm text-slate-500">발송 전 대상 규모를 확인하세요.</p>
            )}
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-white/8 bg-slate-900/50 p-3 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={realSendConfirmed}
              onChange={(e) => setRealSendConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              테스트 발송 결과를 확인했고, 실제 <b className="text-white">{targetLabel}</b>에게 발송합니다.
            </span>
          </label>
        </div>
      </div>

      {result && (
        <div
          className={`mt-4 rounded-lg px-4 py-2.5 text-sm font-medium ${
            result.error
              ? "border border-red-500/20 bg-red-950/40 text-red-300"
              : "border border-emerald-500/20 bg-emerald-950/40 text-emerald-300"
          }`}
        >
          {result.error
            ? `오류: ${result.error}`
            : `✓ ${result.sentCount?.toLocaleString("ko-KR")}명에게 발송 완료`}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={() => send(true)}
          disabled={testSendDisabled}
          className="flex-1 rounded-lg border border-white/15 bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {testState === "sending"
            ? "발송 중…"
            : testState === "done"
              ? "✓ 전송됨"
              : testNativeTokenId
                ? "📱 선택한 폰으로 테스트"
                : "테스트 디바이스 없음"}
        </button>
        <button
          onClick={() => send(false)}
          disabled={realSendDisabled}
          className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state === "sending"
            ? "발송 중…"
            : state === "done"
              ? "✓ 발송 완료"
              : testConfirmed
                ? `🚀 ${targetLabel}에게 실제 발송`
                : "먼저 테스트 발송 필요"}
        </button>
      </div>
      {!testConfirmed && isValid && (
        <p className="mt-2 text-xs text-amber-300">
          실제 발송은 내 폰 테스트가 성공한 뒤에만 열립니다.
        </p>
      )}
    </div>
  );
}

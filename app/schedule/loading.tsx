/**
 * /schedule 서버 렌더를 기다리는 동안 — 탭을 누르자마자 화면이 바뀌어야 눌린 걸 안다.
 * 실제 화면(헤더 + 주간 캘린더 + 경기 카드) 자리만 흐리게 잡아 둔다.
 */
export default function ScheduleLoading() {
  return (
    <div className="flex-1 min-h-0 overflow-hidden" aria-busy="true" aria-label="일정 불러오는 중">
      <section className="animate-pulse pb-nav">
        <header className="flex items-center px-6 pt-7">
          <div className="h-6 w-32 rounded-md bg-white/10" />
        </header>
        <div className="mt-5 grid grid-cols-7 gap-2 px-4">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="h-14 rounded-xl bg-white/[0.06]" />
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3 px-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/[0.05]" />
          ))}
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GROUND 개인정보 처리방침",
  description: "GROUND 앱의 개인정보 수집, 이용, 보관 및 이용자 선택권 안내",
  alternates: {
    canonical: "/privacy",
  },
};

const CONTACT_EMAIL = "janghanr@gmail.com";

const collectedItems = [
  {
    title: "알림 식별 정보",
    body: "웹 푸시 구독 정보(endpoint, p256dh, auth) 또는 네이티브 푸시 토큰(APNs/FCM), 임의로 생성된 사용자 ID",
  },
  {
    title: "앱 설정 정보",
    body: "응원팀, 알림 주제 설정, 온보딩 완료 여부, 알림 수신 상태",
  },
  {
    title: "서비스 이용 정보",
    body: "알림 발송 및 수신 기록, 알림함 읽음 상태, 접속 환경과 페이지 이용에 관한 집계성 분석 정보",
  },
];

const notCollectedItems = [
  "이름, 전화번호, 이메일 주소",
  "정확한 위치 정보",
  "연락처, 사진, 캘린더",
  "결제 정보",
  "광고 추적을 위한 식별자",
];

export default function PrivacyPage() {
  return (
    <main className="document-shell fixed inset-0 overflow-y-auto overscroll-contain bg-[#090a0d] text-white [-webkit-overflow-scrolling:touch]">
      <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/rank"
            className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            앱으로 돌아가기
          </Link>
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/35">
            GROUND
          </p>
        </div>

        <header className="border-b border-white/10 pb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#ff6a3d]">
            Privacy Policy
          </p>
          <h1 className="mt-3 text-[34px] font-black leading-[1.08] tracking-tight text-white sm:text-[44px]">
            개인정보 처리방침
          </h1>
          <p className="mt-4 max-w-2xl break-keep text-[15px] leading-7 text-white/62">
            GROUND는 KBO 응원팀 기반 알림을 제공하기 위해 필요한 최소한의 정보만
            처리합니다. 수집한 정보는 알림 발송, 구독 관리, 서비스 안정화 목적 외에
            광고 추적이나 판매 목적으로 사용하지 않습니다.
          </p>
          <p className="mt-5 text-[12px] text-white/40">시행일: 2026년 6월 4일</p>
        </header>

        <section className="mt-9 space-y-4">
          <h2 className="text-[20px] font-extrabold tracking-tight text-white">
            수집하는 정보
          </h2>
          <div className="grid gap-3">
            {collectedItems.map((item) => (
              <article key={item.title} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <h3 className="text-[15px] font-bold text-white">{item.title}</h3>
                <p className="mt-2 break-keep text-[13px] leading-6 text-white/58">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <PolicySection title="수집하지 않는 정보">
          <ul className="grid gap-2">
            {notCollectedItems.map((item) => (
              <li key={item} className="rounded-md bg-white/[0.035] px-3 py-2 text-[13px] text-white/62">
                {item}
              </li>
            ))}
          </ul>
        </PolicySection>

        <PolicySection title="이용 목적">
          <p>
            수집한 정보는 사용자가 선택한 응원팀과 알림 주제에 맞춰 라인업, 경기 시작,
            실시간 스코어, 하이라이트, 경기 종료 알림을 보내고, 중복 발송을 줄이며,
            알림 구독 상태를 유지하는 데 사용합니다. 서비스 품질 개선을 위해 오류 및
            이용 흐름을 집계 형태로 확인할 수 있습니다.
          </p>
        </PolicySection>

        <PolicySection title="제3자 제공 및 처리 위탁">
          <p>
            GROUND는 개인정보를 판매하지 않으며 광고 추적 목적으로 제3자와 공유하지
            않습니다. 다만 앱 운영을 위해 Apple Push Notification service, Firebase Cloud
            Messaging, Vercel 등 인프라 제공자가 알림 전송, 호스팅, 분석 처리 과정에서
            필요한 범위의 정보를 처리할 수 있습니다.
          </p>
        </PolicySection>

        <PolicySection title="보관 기간">
          <p>
            알림 식별 정보와 설정 정보는 알림 기능 제공 기간 동안 보관합니다. 사용자가
            알림 권한을 해제하거나 구독을 취소하면 해당 구독 정보는 비활성화 또는 삭제될
            수 있습니다. 유효하지 않은 푸시 토큰과 구독 정보는 발송 실패 확인 후 비활성화합니다.
          </p>
        </PolicySection>

        <PolicySection title="이용자 선택권">
          <p>
            사용자는 iOS 설정에서 언제든지 GROUND의 알림 권한을 끌 수 있습니다. 웹에서
            이용하는 경우 브라우저의 알림 권한을 해제하거나 사이트 데이터를 삭제할 수
            있습니다. 데이터 삭제 또는 개인정보 관련 문의는 아래 이메일로 접수할 수 있습니다.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[GROUND] 데이터 삭제 요청")}`}
            className="mt-4 inline-flex rounded-full border border-white/15 px-4 py-2 text-[12px] font-semibold text-white/62 transition hover:border-white/30 hover:text-white/82"
          >
            {CONTACT_EMAIL}
          </a>
        </PolicySection>

        <PolicySection title="아동의 개인정보">
          <p>
            GROUND는 아동을 대상으로 개인정보를 의도적으로 수집하지 않습니다. 법정대리인의
            요청이 있거나 아동 정보가 처리된 사실을 확인하면 필요한 조치를 취하겠습니다.
          </p>
        </PolicySection>

        <PolicySection title="변경 고지">
          <p>
            본 방침은 서비스 변경, 법령 또는 심사 기준 변경에 따라 업데이트될 수 있습니다.
            중요한 변경이 있는 경우 본 페이지를 통해 고지합니다.
          </p>
        </PolicySection>

        <footer className="mt-12 border-t border-white/[0.06] pt-6 text-center text-[11px] text-white/24">
          © 2026 GROUND. All rights reserved.
        </footer>
      </div>
    </main>
  );
}

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9 border-t border-white/10 pt-6">
      <h2 className="text-[20px] font-extrabold tracking-tight text-white">{title}</h2>
      <div className="mt-3 break-keep text-[14px] leading-7 text-white/62">{children}</div>
    </section>
  );
}

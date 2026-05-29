"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;

const CONTACT_EMAIL = "janghanr@gmail.com";

export default function PrivacyPage() {
  return (
    <div
      className="min-h-dvh px-6 py-10 text-white"
      style={{ backgroundColor: "#0a0a0a" }}
    >
      <div className="mx-auto max-w-lg">
        {/* 뒤로가기 */}
        <Link
          href="/rank"
          className="mb-8 inline-flex items-center gap-2 text-[12px] text-white/40 transition hover:text-white/65"
        >
          <ArrowLeft size={14} />
          돌아가기
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
        >
          {/* 헤더 */}
          <p className="text-[10px] uppercase tracking-[0.32em] text-white/35" style={{ fontWeight: 600 }}>
            GROUND
          </p>
          <h1 className="mt-2 text-[32px] font-black leading-tight tracking-tight text-white">
            개인정보처리방침
          </h1>
          <p className="mt-2 text-[12px] text-white/40">
            최종 업데이트: 2026년 6월 1일
          </p>

          <div className="mt-8 space-y-8 text-[13.5px] leading-relaxed text-white/70">

            {/* 1 */}
            <section>
              <h2 className="mb-2 text-[15px] font-bold text-white/90">1. 수집하는 정보</h2>
              <p>GROUND(이하 "앱")는 서비스 제공을 위해 다음 정보를 수집합니다.</p>
              <ul className="mt-3 space-y-2 pl-4">
                <li className="before:mr-2 before:content-['·']">
                  <strong className="text-white/80">기기 식별자</strong> — 앱이 생성하는 익명 ID(ground-user-id)로, 기기에만 저장됩니다. 실명·연락처 등 개인을 직접 식별하는 정보는 수집하지 않습니다.
                </li>
                <li className="before:mr-2 before:content-['·']">
                  <strong className="text-white/80">푸시 알림 토큰</strong> — 알림 수신에 필요한 FCM/APNs 토큰. 알림 발송 목적 외 사용하지 않습니다.
                </li>
                <li className="before:mr-2 before:content-['·']">
                  <strong className="text-white/80">응원 구단 선택</strong> — 팀 맞춤 알림 제공을 위해 기기 로컬에 저장합니다.
                </li>
                <li className="before:mr-2 before:content-['·']">
                  <strong className="text-white/80">서비스 이용 통계</strong> — Vercel Analytics를 통해 페이지 방문 수 등 집계 통계를 수집합니다. 개인을 특정할 수 없는 익명 데이터입니다.
                </li>
              </ul>
            </section>

            {/* 2 */}
            <section>
              <h2 className="mb-2 text-[15px] font-bold text-white/90">2. 정보 이용 목적</h2>
              <ul className="space-y-2 pl-4">
                <li className="before:mr-2 before:content-['·']">KBO 경기 관련 푸시 알림 발송 (라인업, 실시간 경기 상황, 경기 결과)</li>
                <li className="before:mr-2 before:content-['·']">맞춤형 편파 응원 콘텐츠 제공</li>
                <li className="before:mr-2 before:content-['·']">서비스 품질 개선 및 오류 분석</li>
              </ul>
            </section>

            {/* 3 */}
            <section>
              <h2 className="mb-2 text-[15px] font-bold text-white/90">3. 제3자 서비스</h2>
              <p>앱은 다음 외부 서비스를 이용합니다.</p>
              <ul className="mt-3 space-y-2 pl-4">
                <li className="before:mr-2 before:content-['·']">
                  <strong className="text-white/80">Firebase / Google FCM</strong> — 푸시 알림 발송. Google의 개인정보처리방침이 적용됩니다.
                </li>
                <li className="before:mr-2 before:content-['·']">
                  <strong className="text-white/80">Vercel</strong> — 서버 호스팅 및 익명 통계 수집.
                </li>
                <li className="before:mr-2 before:content-['·']">
                  <strong className="text-white/80">Naver 스포츠</strong> — KBO 경기 데이터 제공. 해당 데이터는 표시 목적으로만 사용합니다.
                </li>
              </ul>
            </section>

            {/* 4 */}
            <section>
              <h2 className="mb-2 text-[15px] font-bold text-white/90">4. 정보 보유 및 파기</h2>
              <p>
                푸시 토큰 등 서버 저장 데이터는 알림 설정을 해제하거나 데이터 삭제를 요청하는 시점에 즉시 파기합니다. 로컬 저장 데이터는 앱 삭제 시 자동 삭제됩니다.
              </p>
            </section>

            {/* 5 */}
            <section>
              <h2 className="mb-2 text-[15px] font-bold text-white/90">5. 사용자 권리 및 데이터 삭제</h2>
              <p>
                언제든지 수집된 데이터의 열람·삭제를 요청할 수 있습니다. 아래 이메일로 문의해 주시면 지체 없이 처리해 드립니다.
              </p>
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[GROUND] 데이터 삭제 요청")}`}
                className="mt-3 inline-block rounded-full border border-white/15 px-4 py-2 text-[12px] text-white/55 transition hover:border-white/30 hover:text-white/75"
              >
                {CONTACT_EMAIL}
              </a>
            </section>

            {/* 6 */}
            <section>
              <h2 className="mb-2 text-[15px] font-bold text-white/90">6. 개인정보 보호책임자</h2>
              <p>개인정보 관련 문의는 아래 연락처로 접수해 주세요.</p>
              <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[12.5px]">
                <p><span className="text-white/40">서비스명</span>　GROUND</p>
                <p className="mt-1"><span className="text-white/40">이메일　</span>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-white/65 underline underline-offset-2">{CONTACT_EMAIL}</a>
                </p>
              </div>
            </section>

            {/* 7 */}
            <section>
              <h2 className="mb-2 text-[15px] font-bold text-white/90">7. 방침 변경</h2>
              <p>
                본 방침이 변경될 경우 앱 내 공지 또는 이 페이지를 통해 사전 안내합니다.
              </p>
            </section>

          </div>

          {/* 하단 여백 */}
          <div className="mt-12 border-t border-white/[0.06] pt-6 text-center text-[11px] text-white/20">
            © 2026 GROUND. All rights reserved.
          </div>
        </motion.div>
      </div>
    </div>
  );
}

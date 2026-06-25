/**
 * Firebase Admin SDK — 서버 사이드 전용 (Node runtime).
 *
 * 환경변수:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  Firebase 서비스 계정 JSON 전체를 문자열로 (Vercel에 등록)
 *
 * Firebase 서비스 계정 발급:
 *   1. console.firebase.google.com → 프로젝트 설정 → 서비스 계정
 *   2. "새 비공개 키 생성" → JSON 다운로드
 *   3. 파일 내용을 그대로 Vercel 환경변수 FIREBASE_SERVICE_ACCOUNT_JSON에 붙여넣기
 */

import admin from "firebase-admin";

let _app: admin.app.App | null = null;

function getApp(): admin.app.App {
  if (_app) return _app;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  let serviceAccount: admin.ServiceAccount;
  try {
    serviceAccount = JSON.parse(json) as admin.ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (admin.apps.length > 0) {
    _app = admin.apps[0]!;
    return _app;
  }
  _app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return _app;
}

export type FcmResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; invalidToken?: boolean };

/**
 * 단일 FCM 토큰에 푸시 알림 전송.
 * 토큰이 만료/무효이면 invalidToken: true 반환 → 호출 측에서 DB 비활성화.
 */
export async function sendFcmNotification(input: {
  token: string;
  title: string;
  body: string;
  /** 클릭 시 이동할 URL */
  url?: string;
  /** 커스텀 데이터 페이로드 (문자열 값만 허용) */
  data?: Record<string, string>;
}): Promise<FcmResult> {
  try {
    const messaging = getApp().messaging();
    const messageId = await messaging.send({
      token: input.token,
      notification: {
        title: input.title,
        body: input.body,
      },
      data: {
        url: input.url ?? "/",
        ...input.data,
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 0,
          },
        },
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
    });
    return { ok: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const invalidToken =
      msg.includes("registration-token-not-registered") ||
      msg.includes("invalid-registration-token") ||
      msg.includes("Requested entity was not found");
    return { ok: false, error: msg.slice(0, 200), invalidToken };
  }
}

/**
 * 여러 FCM 토큰에 한번에 전송 (최대 500개 / 배치).
 * 반환값: { ok, failed } — failed에 무효 토큰 목록 포함.
 */
export async function sendFcmMulticast(input: {
  tokens: string[];
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
}): Promise<{ ok: number; failed: string[] }> {
  if (input.tokens.length === 0) return { ok: 0, failed: [] };

  const BATCH_SIZE = 500;
  let totalOk = 0;
  const allFailed: string[] = [];

  for (let i = 0; i < input.tokens.length; i += BATCH_SIZE) {
    const batch = input.tokens.slice(i, i + BATCH_SIZE);
    const messaging = getApp().messaging();
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title: input.title, body: input.body },
      data: { url: input.url ?? "/", ...(input.data ?? {}) },
      apns: { payload: { aps: { sound: "default", badge: 0 } } },
      android: { priority: "high" },
    });
    totalOk += response.successCount;
    response.responses.forEach((r, idx) => {
      if (!r.success) allFailed.push(batch[idx]!);
    });
  }

  return { ok: totalOk, failed: allFailed };
}

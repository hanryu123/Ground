"use client";

/**
 * Capacitor 네이티브 앱 푸시 알림 등록 — 클라이언트 사이드 전용.
 *
 * 동작 흐름:
 *   1. Capacitor.isNativePlatform() 확인 (웹에서는 아무 것도 하지 않음)
 *   2. 권한 요청 → 거부되면 early return
 *   3. PushNotifications.register() → FCM/APNs 토큰 수신
 *   4. 서버(/api/notifications/subscribe/native)에 토큰 등록
 *   5. 포그라운드 알림 수신 / 알림 클릭 딥링크 처리
 */

import type { PushNotificationSchema, Token, ActionPerformed } from "@capacitor/push-notifications";

type NativePushOptions = {
  userId: string;
  favoriteTeam: string;
  topics?: Record<string, boolean>;
};

let _listenersRegistered = false;
let _latestOptions: NativePushOptions | null = null;
let _lastToken: { value: string; platform: string } | null = null;

function resolvePushTarget(rawUrl: string | undefined): { url: string; internal: boolean } {
  const fallback = "/today";
  const value = rawUrl?.trim() || fallback;
  if (!value.startsWith("http")) {
    return { url: value.startsWith("/") ? value : `/${value}`, internal: true };
  }

  try {
    const parsed = new URL(value);
    if (parsed.origin === window.location.origin) {
      const path = parsed.pathname === "/" ? fallback : parsed.pathname || fallback;
      return {
        url: `${path}${parsed.search}${parsed.hash}` || fallback,
        internal: true,
      };
    }
    return { url: value, internal: false };
  } catch {
    return { url: fallback, internal: true };
  }
}

function navigateInNativeApp(rawUrl: string | undefined): void {
  const target = resolvePushTarget(rawUrl);
  if (!target.internal) {
    window.location.href = target.url;
    return;
  }
  window.location.href = target.url;
}

async function registerTokenWithServer(
  token: string,
  platform: string,
  options: NativePushOptions
): Promise<void> {
  const res = await fetch("/api/notifications/subscribe/native", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ground-user-id": options.userId,
    },
    body: JSON.stringify({
      token,
      platform,
      favoriteTeam: options.favoriteTeam,
      topics: options.topics ?? {},
    }),
  });

  if (!res.ok) {
    throw new Error(`native subscribe failed (${res.status})`);
  }
}

export async function registerNativePush(options: NativePushOptions): Promise<void> {
  // 서버 사이드 렌더링 / 웹 환경에서는 실행하지 않음
  if (typeof window === "undefined") return;

  // Capacitor 네이티브 환경인지 동적으로 확인
  let Capacitor: typeof import("@capacitor/core").Capacitor;
  let PushNotifications: typeof import("@capacitor/push-notifications").PushNotifications;
  try {
    const core = await import("@capacitor/core");
    const push = await import("@capacitor/push-notifications");
    Capacitor = core.Capacitor;
    PushNotifications = push.PushNotifications;
  } catch {
    return; // 패키지 로드 실패 (웹 환경)
  }

  if (!Capacitor.isNativePlatform()) return;
  _latestOptions = options;

  // 권한 요청
  let permission: { receive: string };
  try {
    permission = await PushNotifications.requestPermissions();
  } catch {
    return;
  }
  if (permission.receive !== "granted") {
    console.warn("[nativePush] permission denied");
    return;
  }

  // 리스너는 한 번만 등록
  if (!_listenersRegistered) {
    _listenersRegistered = true;

    // 1) 토큰 수신 → 서버에 저장
    await PushNotifications.addListener("registration", async (token: Token) => {
      const platform = Capacitor.getPlatform(); // "ios" | "android"
      _lastToken = { value: token.value, platform };
      const latest = _latestOptions;
      if (!latest) return;

      try {
        await registerTokenWithServer(token.value, platform, latest);
        console.info("[nativePush] token registered:", token.value.slice(0, 12) + "…");
      } catch (err) {
        console.error("[nativePush] token registration failed:", err);
      }
    });

    // 2) 토큰 등록 에러
    await PushNotifications.addListener("registrationError", (err: unknown) => {
      console.error("[nativePush] registration error:", err);
    });

    // 3) 포그라운드 알림 수신 (앱이 켜져 있을 때)
    await PushNotifications.addListener(
      "pushNotificationReceived",
      (notification: PushNotificationSchema) => {
        console.info("[nativePush] foreground notification:", notification.title);
        // 필요하면 앱 내 토스트/인박스 UI 갱신
      }
    );

    // 4) 알림 클릭 (앱 백그라운드/종료 후 탭)
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: ActionPerformed) => {
        const url: string = (action.notification.data as Record<string, string>)?.url ?? "/";
        navigateInNativeApp(url);
      }
    );
  } else if (_lastToken) {
    await registerTokenWithServer(_lastToken.value, _lastToken.platform, options);
  }

  // 기기 등록은 리스너 연결 후 호출해야 registration 이벤트를 놓치지 않는다.
  await PushNotifications.register();
}

/** 네이티브 앱에서 푸시 토큰 등록 해제 (설정에서 알림 OFF 시). */
export async function unregisterNativePush(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    const { PushNotifications } = await import("@capacitor/push-notifications");
    if (!Capacitor.isNativePlatform()) return;
    await PushNotifications.removeAllListeners();
    _listenersRegistered = false;
  } catch {
    // ignore
  }
}

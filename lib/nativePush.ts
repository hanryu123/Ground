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

  // 기기 등록 (FCM/APNs 토큰 발급 요청)
  await PushNotifications.register();

  // 리스너는 한 번만 등록
  if (_listenersRegistered) return;
  _listenersRegistered = true;

  // 1) 토큰 수신 → 서버에 저장
  await PushNotifications.addListener("registration", async (token: Token) => {
    const platform = Capacitor.getPlatform(); // "ios" | "android"
    try {
      await fetch("/api/notifications/subscribe/native", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ground-user-id": options.userId,
        },
        body: JSON.stringify({
          token: token.value,
          platform,
          favoriteTeam: options.favoriteTeam,
          topics: options.topics ?? {},
        }),
      });
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
      // 딥링크: Today 탭 or 지정 경로로 이동
      if (url.startsWith("http")) {
        window.location.href = url;
      } else {
        window.location.pathname = url;
      }
    }
  );
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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type DeviceOS = "ios" | "android" | "other";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function detectDeviceOS(userAgent: string): DeviceOS {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const matches = window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return matches || iosStandalone;
}

export function usePwaInstallGate() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [os, setOs] = useState<DeviceOS>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia?.("(display-mode: standalone)");
    const sync = () => setIsStandalone(detectStandalone());
    sync();

    if (mq) {
      const onChange = () => sync();
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOs(detectDeviceOS(window.navigator.userAgent));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeInstallPrompt = (event: Event) => {
      const e = event as BeforeInstallPromptEvent;
      event.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome;
  }, [deferredPrompt]);

  return useMemo(
    () => ({
      isStandalone,
      os,
      deferredPrompt,
      canPromptInstall: Boolean(deferredPrompt),
      promptInstall,
    }),
    [deferredPrompt, isStandalone, os, promptInstall]
  );
}

"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import EnvironmentBadge from "@/components/EnvironmentBadge";
import OnboardingGate from "@/components/OnboardingGate";
import PageShell from "@/components/PageShell";

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin") ?? false;

  if (isAdminRoute) {
    return (
      <div className="min-h-dvh w-full bg-slate-950 text-slate-100">
        {children}
      </div>
    );
  }

  return (
    <OnboardingGate>
      <div
        className="app-shell fixed inset-0 mx-auto flex min-h-0 w-full max-w-md flex-col overflow-hidden bg-black"
        style={{
          height: "var(--visual-viewport-height, 100dvh)",
          maxHeight: "var(--visual-viewport-height, 100dvh)",
          backgroundColor: "var(--app-bg, #000000)",
          color: "var(--app-text, #ffffff)",
        }}
      >
        <EnvironmentBadge />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-24">
          <PageShell>{children}</PageShell>
        </main>
        <BottomNav />
      </div>
    </OnboardingGate>
  );
}

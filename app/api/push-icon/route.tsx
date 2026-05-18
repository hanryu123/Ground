import { ImageResponse } from "next/og";
import { TEAM_COLORS, TEAM_SHORT_LABELS } from "@/lib/teams";

export const runtime = "edge";
export const size = {
  width: 192,
  height: 192,
};
export const contentType = "image/png";

const FALLBACK_BG = "#111827";
const FALLBACK_LABEL = "G";

const TEAM_PATTERNS: Record<string, string> = {
  lg: "repeating-linear-gradient(90deg, rgba(255,255,255,0.24) 0, rgba(255,255,255,0.24) 4px, rgba(0,0,0,0) 4px, rgba(0,0,0,0) 12px)",
  doosan:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.22) 0, rgba(255,255,255,0.22) 3px, rgba(0,0,0,0) 3px, rgba(0,0,0,0) 11px)",
  hanwha:
    "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%)",
  kia: "linear-gradient(135deg, rgba(0,0,0,0.2), rgba(0,0,0,0) 60%)",
  samsung:
    "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 62%)",
  lotte: "linear-gradient(45deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 55%)",
  ssg: "linear-gradient(160deg, rgba(255,255,255,0.15), rgba(255,255,255,0) 58%)",
  nc: "linear-gradient(0deg, rgba(255,255,255,0.14), rgba(255,255,255,0) 50%)",
  kiwoom:
    "linear-gradient(120deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 56%)",
  kt: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0) 58%)",
};

function normalizeTeam(team: string | null): string | null {
  if (!team) return null;
  const normalized = team.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const team = normalizeTeam(searchParams.get("team"));
  const bg = team ? TEAM_COLORS[team] ?? FALLBACK_BG : FALLBACK_BG;
  const label = team ? TEAM_SHORT_LABELS[team] ?? FALLBACK_LABEL : FALLBACK_LABEL;
  const pattern = team ? TEAM_PATTERNS[team] : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "192px",
          height: "192px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: bg,
          color: "#FFFFFF",
          fontSize: "64px",
          fontWeight: 800,
          letterSpacing: "-1px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {pattern ? (
          <div
            style={{
              position: "absolute",
              inset: "0",
              backgroundImage: pattern,
            }}
          />
        ) : null}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            textShadow: "0 2px 8px rgba(0,0,0,0.35)",
          }}
        >
        {label}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GROUND",
    short_name: "GROUND",
    description: "오늘의 KBO 야구 일정과 선발 투수",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "ko",
  };
}

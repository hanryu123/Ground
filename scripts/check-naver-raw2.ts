// Naver 실제 raw 응답 필드 전체 확인

async function main() {
  const url =
    "https://api-gw.sports.naver.com/schedule/games" +
    "?fields=basic,statusInfo,score" +
    "&upperCategoryId=kbaseball&categoryId=kbo" +
    "&fromDate=2026-05-20&toDate=2026-05-20&size=200";

  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0",
      accept: "application/json",
      referer: "https://m.sports.naver.com/",
    },
    cache: "no-store",
  });
  console.log("HTTP", res.status);
  const json = await res.json() as any;
  const games = json?.result?.games ?? [];
  // LG 경기만
  const lgGame = games.find((g: any) => g.homeTeamCode === "HT" || g.awayTeamCode === "LG");
  if (lgGame) {
    console.log("=== LG 경기 raw ===");
    console.log(JSON.stringify(lgGame, null, 2));
  } else {
    console.log("=== 전체 첫번째 경기 raw ===");
    console.log(JSON.stringify(games[0], null, 2));
  }
}

main().catch(console.error);

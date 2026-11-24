import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

private let groundStartTimeFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "ko_KR")
    formatter.timeZone = TimeZone(identifier: "Asia/Seoul")
    formatter.dateFormat = "HH:mm"
    return formatter
}()

private extension GroundGameAttributes {
    var matchupText: String {
        "\(awayTeam) @ \(homeTeam)"
    }

    var gameStartDate: Date? {
        guard let gameStartEpochMs else { return nil }
        return Date(timeIntervalSince1970: gameStartEpochMs / 1000)
    }

    var hasScheduledStartPassed: Bool {
        guard let start = gameStartDate else { return false }
        return start <= Date()
    }

    var myTeamShort: String {
        switch teamId.lowercased() {
        case "lg": return "LG"
        case "kt": return "KT"
        case "ssg": return "SSG"
        case "nc": return "NC"
        case "doosan": return "두산"
        case "kia": return "KIA"
        case "samsung": return "삼성"
        case "lotte": return "롯데"
        case "hanwha": return "한화"
        case "kiwoom": return "키움"
        default: return teamId.uppercased()
        }
    }

    private func cleanPitcherName(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed == "미정" || trimmed == "-" { return nil }
        return trimmed
    }

    var starterMatchupText: String? {
        let away = cleanPitcherName(awayPitcher)
        let home = cleanPitcherName(homePitcher)
        if let away, let home {
            return "선발 \(away) vs \(home)"
        }
        if let away {
            return "\(awayTeam) 선발 \(away)"
        }
        if let home {
            return "\(homeTeam) 선발 \(home)"
        }
        return nil
    }

    func phaseLabel(for state: GroundGameAttributes.ContentState) -> String {
        if state.isPregame && hasScheduledStartPassed { return "STARTING" }
        return state.phaseLabel
    }

    func contextLabel(for state: GroundGameAttributes.ContentState) -> String {
        if state.isPregame {
            if hasScheduledStartPassed { return "경기 시작 대기" }
            if let start = gameStartDate { return groundStartTimeFormatter.string(from: start) }
        }
        return state.contextLabel
    }

    func detailText(for state: GroundGameAttributes.ContentState) -> String? {
        if state.isPregame {
            if let starters = starterMatchupText {
                if let start = gameStartDate, start > Date() {
                    return "\(starters) · \(groundStartTimeFormatter.string(from: start)) 시작"
                }
                return starters
            }
            if let start = gameStartDate, start > Date() {
                return "\(groundStartTimeFormatter.string(from: start)) 시작"
            }
        }
        if let stadium, !stadium.isEmpty {
            return stadium
        }
        return nil
    }

    func displayScores(for state: GroundGameAttributes.ContentState) -> (leftTeam: String, leftScore: Int, leftIsFavorite: Bool, rightTeam: String, rightScore: Int, rightIsFavorite: Bool) {
        if awayTeam.caseInsensitiveCompare(myTeamShort) == .orderedSame {
            return (awayTeam, state.awayScore, true, homeTeam, state.homeScore, false)
        }
        if homeTeam.caseInsensitiveCompare(myTeamShort) == .orderedSame {
            return (homeTeam, state.homeScore, true, awayTeam, state.awayScore, false)
        }
        return (homeTeam, state.homeScore, false, awayTeam, state.awayScore, false)
    }

    func resultSummary(for state: GroundGameAttributes.ContentState) -> String? {
        guard state.isFinal, let result = state.resultLabel else { return nil }
        switch result {
        case "승":
            return "\(myTeamShort) 승리"
        case "패":
            return "\(myTeamShort) 패배"
        case "무":
            return "무승부"
        default:
            return "\(myTeamShort) \(result)"
        }
    }

    var accent: Color {
        switch teamId.lowercased() {
        case "kia":
            return Color(red: 0.918, green: 0.0, blue: 0.161)
        case "samsung":
            return Color(red: 0.027, green: 0.298, blue: 0.631)
        case "doosan":
            return Color(red: 0.075, green: 0.071, blue: 0.188)
        case "lotte":
            return Color(red: 0.306, green: 0.749, blue: 1.0)
        case "ssg":
            return Color(red: 0.808, green: 0.055, blue: 0.176)
        case "nc":
            return Color(red: 0.192, green: 0.322, blue: 0.533)
        case "hanwha":
            return Color(red: 1.0, green: 0.4, blue: 0.0)
        case "kiwoom":
            return Color(red: 0.565, green: 0.0, blue: 0.125)
        default:
            return Color(red: 0.78, green: 0.02, blue: 0.32)
        }
    }
}

private extension GroundGameAttributes.ContentState {
    var isPregame: Bool { phase == "PRE" }
    var isFinal: Bool { phase == "FINAL" }
    var isCancelled: Bool { phase == "CANCEL" }
    var scoreText: String {
        "\(homeScore):\(awayScore)"
    }

    var phaseLabel: String {
        if isPregame { return "UP NEXT" }
        if isFinal { return "FINAL" }
        if isCancelled { return "CANCELLED" }
        return "LIVE"
    }

    var contextLabel: String {
        if isFinal { return "경기 종료" }
        if isCancelled { return status }
        return inning
    }
}

private struct ScoreColumn: View {
    let team: String
    let score: Int
    let alignTrailing: Bool
    let scoreColor: Color

    var body: some View {
        VStack(alignment: alignTrailing ? .trailing : .leading, spacing: 3) {
            Text(team)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.white.opacity(0.58))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text("\(score)")
                .font(.system(size: 40, weight: .black, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(scoreColor)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: alignTrailing ? .trailing : .leading)
    }
}

private struct ScoreDivider: View {
    var body: some View {
        VStack(spacing: 3) {
            Text(" ")
                .font(.caption2.weight(.bold))
            Text(":")
                .font(.system(size: 28, weight: .black, design: .rounded))
                .foregroundStyle(.white.opacity(0.28))
        }
        .accessibilityHidden(true)
    }
}

struct GroundLiveActivityLockScreenView: View {
    let context: ActivityViewContext<GroundGameAttributes>

    var body: some View {
        let state = context.state
        let accent = context.attributes.accent
        let scores = context.attributes.displayScores(for: state)

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("GROUND")
                        .font(.caption2.weight(.black))
                        .tracking(1.6)
                        .foregroundStyle(.white.opacity(0.88))
                    Text(context.attributes.matchupText)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 2) {
                    Text(context.attributes.phaseLabel(for: state))
                        .font(.caption2.weight(.black))
                        .tracking(1.2)
                        .foregroundStyle(accent)
                    Text(context.attributes.contextLabel(for: state))
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }

            HStack(alignment: .center, spacing: 12) {
                ScoreColumn(
                    team: scores.leftTeam,
                    score: scores.leftScore,
                    alignTrailing: false,
                    scoreColor: scores.leftIsFavorite ? accent : .white
                )

                ScoreDivider()

                ScoreColumn(
                    team: scores.rightTeam,
                    score: scores.rightScore,
                    alignTrailing: true,
                    scoreColor: scores.rightIsFavorite ? accent : .white
                )
            }

            HStack(alignment: .center, spacing: 7) {
                if state.isFinal {
                    if let resultSummary = context.attributes.resultSummary(for: state) {
                        Text(resultSummary)
                            .foregroundStyle(accent)
                    }
                    if let winningPitcher = state.winningPitcher {
                        Text("승 \(winningPitcher)")
                    }
                    if let losingPitcher = state.losingPitcher {
                        Text("패 \(losingPitcher)")
                    }
                } else if let detail = context.attributes.detailText(for: state) {
                    Text(detail)
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white.opacity(0.62))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        .padding(.leading, 18)
        .padding(.trailing, 18)
        .padding(.top, 16)
        .padding(.bottom, 13)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.015, green: 0.017, blue: 0.026),
                    Color(red: 0.028, green: 0.031, blue: 0.045),
                    accent.opacity(0.24)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .overlay(alignment: .topTrailing) {
            Circle()
                .fill(accent.opacity(0.22))
                .blur(radius: 30)
                .frame(width: 180, height: 180)
                .offset(x: 66, y: -104)
        }
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(accent.opacity(0.95))
                .frame(width: 5)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .activityBackgroundTint(Color(red: 0.015, green: 0.017, blue: 0.026))
        .activitySystemActionForegroundColor(accent)
        .widgetURL(URL(string: "https://ground-alpha.vercel.app/today"))
    }
}

struct GroundLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GroundGameAttributes.self) { context in
            GroundLiveActivityLockScreenView(context: context)
        } dynamicIsland: { context in
            let accent = context.attributes.accent
            let scores = context.attributes.displayScores(for: context.state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(scores.leftTeam)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white.opacity(0.55))
                        Text("\(scores.leftScore)")
                            .font(.title.weight(.black))
                            .monospacedDigit()
                            .foregroundStyle(scores.leftIsFavorite ? accent : .white)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(scores.rightTeam)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white.opacity(0.55))
                        Text("\(scores.rightScore)")
                            .font(.title.weight(.black))
                            .monospacedDigit()
                            .foregroundStyle(scores.rightIsFavorite ? accent : .white)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text("GROUND")
                            .font(.caption2.weight(.black))
                            .tracking(1)
                            .foregroundStyle(accent)
                        Text(context.attributes.contextLabel(for: context.state))
                            .font(.caption.weight(.heavy))
                            .foregroundStyle(.white.opacity(0.82))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 8) {
                        Capsule()
                            .fill(accent)
                            .frame(width: 24, height: 4)
                        Text(scores.leftTeam)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.58))
                        Text(context.attributes.detailText(for: context.state) ?? context.attributes.matchupText)
                            .font(.caption.weight(.bold))
                            .lineLimit(1)
                        Spacer()
                        Text(context.attributes.phaseLabel(for: context.state))
                            .font(.caption.weight(.black))
                            .foregroundStyle(accent)
                    }
                }
            } compactLeading: {
                Text("\(scores.leftScore)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(scores.leftIsFavorite ? accent : .white)
            } compactTrailing: {
                Text("\(scores.rightScore)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(scores.rightIsFavorite ? accent : .white)
            } minimal: {
                Text(context.state.isPregame ? "G" : "\(scores.leftScore):\(scores.rightScore)")
                    .font(.caption2.weight(.black))
                    .foregroundStyle(accent)
            }
            .widgetURL(URL(string: "https://ground-alpha.vercel.app/today"))
        }
    }
}

// MARK: - 홈 화면 위젯 "오늘 경기 티켓" (iOS 17+)
//
// 앱의 오늘 탭 티켓을 홈 화면에 — 경기 전엔 시작 시간, 경기 중엔 점수와 이닝, 끝나면 결과 도장.
// 위젯은 앱의 저장소를 못 읽어서 응원팀은 위젯 편집(길게 누르기 → 위젯 편집)에서 고른다.
// 데이터는 앱과 같은 /api/kbo/today 를 읽는다.

@available(iOS 17.0, *)
enum GroundClub: String, AppEnum {
    case kia, samsung, lg, kt, doosan, ssg, lotte, hanwha, nc, kiwoom

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "응원팀"
    static var caseDisplayRepresentations: [GroundClub: DisplayRepresentation] = [
        .kia: "KIA 타이거즈", .samsung: "삼성 라이온즈", .lg: "LG 트윈스", .kt: "KT 위즈", .doosan: "두산 베어스",
        .ssg: "SSG 랜더스", .lotte: "롯데 자이언츠", .hanwha: "한화 이글스", .nc: "NC 다이노스", .kiwoom: "키움 히어로즈",
    ]

    /// lib/clubTheme.ts 와 같은 값 — field(티켓 면), onField(글자)
    var field: Color {
        switch self {
        case .lg: return Color(red: 0xC3 / 255, green: 0x04 / 255, blue: 0x52 / 255)
        case .samsung: return Color(red: 0x07 / 255, green: 0x4C / 255, blue: 0xA1 / 255)
        case .kt: return Color(red: 0x1D / 255, green: 0x1D / 255, blue: 0x1F / 255)
        case .doosan: return Color(red: 0x13 / 255, green: 0x12 / 255, blue: 0x30 / 255)
        case .kia: return Color(red: 0xEA / 255, green: 0x00 / 255, blue: 0x29 / 255)
        case .hanwha: return Color(red: 0xFF / 255, green: 0x66 / 255, blue: 0x00 / 255)
        case .nc: return Color(red: 0x31 / 255, green: 0x52 / 255, blue: 0x88 / 255)
        case .lotte: return Color(red: 0x04 / 255, green: 0x1E / 255, blue: 0x42 / 255)
        case .ssg: return Color(red: 0xCE / 255, green: 0x0E / 255, blue: 0x2D / 255)
        case .kiwoom: return Color(red: 0x82 / 255, green: 0x00 / 255, blue: 0x24 / 255)
        }
    }

    var onField: Color { self == .hanwha ? Color(red: 0x1C / 255, green: 0x1C / 255, blue: 0x1E / 255) : .white }
}

func groundShortName(_ teamId: String) -> String {
    switch teamId.lowercased() {
    case "lg": return "LG"
    case "kt": return "KT"
    case "ssg": return "SSG"
    case "nc": return "NC"
    case "doosan": return "두산"
    case "kia": return "KIA"
    case "samsung": return "삼성"
    case "lotte": return "롯데"
    case "hanwha": return "한화"
    case "kiwoom": return "키움"
    default: return teamId.uppercased()
    }
}

@available(iOS 17.0, *)
struct GroundTodayIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "오늘 경기"
    static var description = IntentDescription("응원팀의 오늘 경기를 티켓으로 보여 줘요.")

    @Parameter(title: "응원팀", default: .kia)
    var club: GroundClub
}

struct GroundTodayPayload: Decodable {
    struct Score: Decodable { let homeScore: Int; let awayScore: Int; let inningLabel: String? }
    struct Result: Decodable { let homeScore: Int; let awayScore: Int; let winnerId: String? }
    struct Game: Decodable {
        let homeId: String
        let awayId: String
        let time: String
        let status: String
        let liveScore: Score?
        let result: Result?
    }
    let games: [Game]
}

enum GroundTicketState {
    case noGame
    case before(time: String, opponent: String, home: Bool)
    case live(my: Int, opp: Int, inning: String?, opponent: String)
    case final(my: Int, opp: Int, outcome: String, opponent: String)
    case cancelled(opponent: String)
}

@available(iOS 17.0, *)
struct GroundTodayEntry: TimelineEntry {
    let date: Date
    let club: GroundClub
    let state: GroundTicketState
}

@available(iOS 17.0, *)
struct GroundTodayProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> GroundTodayEntry {
        GroundTodayEntry(date: .now, club: .kia, state: .before(time: "18:30", opponent: "삼성", home: true))
    }

    func snapshot(for configuration: GroundTodayIntent, in context: Context) async -> GroundTodayEntry {
        context.isPreview ? placeholder(in: context) : await load(configuration.club)
    }

    func timeline(for configuration: GroundTodayIntent, in context: Context) async -> Timeline<GroundTodayEntry> {
        let entry = await load(configuration.club)
        // 경기 중엔 15분, 그 밖엔 1시간마다 (위젯 새로고침 횟수는 iOS 가 제한한다)
        let minutes: Double
        if case .live = entry.state { minutes = 15 } else { minutes = 60 }
        return Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(minutes * 60)))
    }

    private func load(_ club: GroundClub) async -> GroundTodayEntry {
        let id = club.rawValue
        guard let url = URL(string: "https://ground-alpha.vercel.app/api/kbo/today?teamId=\(id)&withStandings=0"),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let payload = try? JSONDecoder().decode(GroundTodayPayload.self, from: data),
              let game = payload.games.first(where: { $0.homeId == id || $0.awayId == id })
        else {
            return GroundTodayEntry(date: .now, club: club, state: .noGame)
        }
        let home = game.homeId == id
        let opponent = groundShortName(home ? game.awayId : game.homeId)
        let state: GroundTicketState
        if game.status == "CANCEL" {
            state = .cancelled(opponent: opponent)
        } else if let r = game.result, game.status == "RESULT" {
            let my = home ? r.homeScore : r.awayScore
            let opp = home ? r.awayScore : r.homeScore
            state = .final(my: my, opp: opp, outcome: r.winnerId == nil ? "무" : (r.winnerId == id ? "승" : "패"), opponent: opponent)
        } else if let s = game.liveScore, game.status == "LIVE" {
            state = .live(my: home ? s.homeScore : s.awayScore, opp: home ? s.awayScore : s.homeScore, inning: s.inningLabel, opponent: opponent)
        } else {
            state = .before(time: game.time, opponent: opponent, home: home)
        }
        return GroundTodayEntry(date: .now, club: club, state: state)
    }
}

@available(iOS 17.0, *)
struct GroundTodayWidgetView: View {
    let entry: GroundTodayEntry
    @Environment(\.widgetFamily) private var family

    private var my: String { groundShortName(entry.club.rawValue) }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            switch entry.state {
            case .noGame:
                Text(my).font(.system(size: 22, weight: .black))
                Spacer(minLength: 0)
                Text("오늘은 경기가 없어요").font(.system(size: 13, weight: .semibold)).opacity(0.85)
            case let .before(time, opponent, home):
                Text("\(my) vs \(opponent)").font(.system(size: 17, weight: .black)).lineLimit(1)
                Text(home ? "홈" : "원정").font(.system(size: 12, weight: .semibold)).opacity(0.8)
                Spacer(minLength: 0)
                Text(time).font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
            case let .live(myScore, opp, inning, opponent):
                Text("\(my) vs \(opponent)").font(.system(size: 15, weight: .black)).lineLimit(1)
                Text(inning ?? "경기 중").font(.system(size: 12, weight: .bold)).opacity(0.85)
                Spacer(minLength: 0)
                Text("\(myScore) : \(opp)").font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
            case let .final(myScore, opp, outcome, opponent):
                HStack(alignment: .top) {
                    Text("\(my) vs \(opponent)").font(.system(size: 15, weight: .black)).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(outcome)
                        .font(.system(size: 15, weight: .black))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(lineWidth: 2))
                        .rotationEffect(.degrees(-8))
                }
                Text("경기 종료").font(.system(size: 12, weight: .bold)).opacity(0.85)
                Spacer(minLength: 0)
                Text("\(myScore) : \(opp)").font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
            case let .cancelled(opponent):
                Text("\(my) vs \(opponent)").font(.system(size: 15, weight: .black))
                Spacer(minLength: 0)
                Text("경기 취소").font(.system(size: 20, weight: .bold))
            }
        }
        .foregroundStyle(entry.club.onField)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(entry.club.field, for: .widget)
        .widgetURL(URL(string: "https://ground-alpha.vercel.app/today"))
    }
}

@available(iOS 17.0, *)
struct GroundTodayWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "GroundTodayWidget", intent: GroundTodayIntent.self, provider: GroundTodayProvider()) { entry in
            GroundTodayWidgetView(entry: entry)
        }
        .configurationDisplayName("오늘 경기 티켓")
        .description("응원팀의 오늘 경기 — 시작 시간, 점수, 결과")
        .supportedFamilies([.systemSmall])
    }
}

@main
struct GroundLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        GroundLiveActivityWidget()
        if #available(iOS 17.0, *) {
            GroundTodayWidget()
        }
    }
}

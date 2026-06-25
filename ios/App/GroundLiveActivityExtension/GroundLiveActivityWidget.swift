import ActivityKit
import SwiftUI
import WidgetKit

private extension GroundGameAttributes {
    var matchupText: String {
        "\(awayTeam) @ \(homeTeam)"
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
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: alignTrailing ? .trailing : .leading)
    }
}

struct GroundLiveActivityLockScreenView: View {
    let context: ActivityViewContext<GroundGameAttributes>

    var body: some View {
        let state = context.state
        let accent = context.attributes.accent

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(accent)
                    Text("G")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(.black.opacity(0.82))
                }
                .frame(width: 22, height: 22)

                VStack(alignment: .leading, spacing: 1) {
                    Text("GROUND")
                        .font(.caption2.weight(.black))
                        .tracking(1.2)
                        .foregroundStyle(.white.opacity(0.88))
                    Text(context.attributes.matchupText)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 2) {
                    Text(state.phaseLabel)
                        .font(.caption2.weight(.black))
                        .tracking(0.8)
                        .foregroundStyle(accent)
                    Text(state.contextLabel)
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                ScoreColumn(team: context.attributes.homeTeam, score: state.homeScore, alignTrailing: false)

                Text(":")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(.white.opacity(0.28))
                    .padding(.bottom, 4)

                ScoreColumn(team: context.attributes.awayTeam, score: state.awayScore, alignTrailing: true)
            }

            HStack(alignment: .center, spacing: 7) {
                if state.isFinal {
                    if let result = state.resultLabel {
                        Text(result)
                            .font(.caption2.weight(.black))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(accent.opacity(0.95)))
                            .foregroundStyle(.black.opacity(0.82))
                    }
                    if let winningPitcher = state.winningPitcher {
                        Text("승 \(winningPitcher)")
                    }
                    if let losingPitcher = state.losingPitcher {
                        Text("패 \(losingPitcher)")
                    }
                } else if state.isPregame, let start = context.attributes.gameStartEpochMs {
                    Text(Date(timeIntervalSince1970: start / 1000), style: .relative)
                    Text("까지")
                } else if let stadium = context.attributes.stadium, !stadium.isEmpty {
                    Text(stadium)
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white.opacity(0.62))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        .padding(.leading, 17)
        .padding(.trailing, 14)
        .padding(.vertical, 12)
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
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(context.attributes.homeTeam)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white.opacity(0.55))
                        Text("\(context.state.homeScore)")
                            .font(.title.weight(.black))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(context.attributes.awayTeam)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white.opacity(0.55))
                        Text("\(context.state.awayScore)")
                            .font(.title.weight(.black))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text("GROUND")
                            .font(.caption2.weight(.black))
                            .tracking(1)
                            .foregroundStyle(accent)
                        Text(context.state.contextLabel)
                            .font(.caption.weight(.heavy))
                            .foregroundStyle(.white.opacity(0.82))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 8) {
                        Capsule()
                            .fill(accent)
                            .frame(width: 24, height: 4)
                        Text(context.attributes.homeTeam)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.58))
                        Text(context.attributes.matchupText)
                            .font(.caption.weight(.bold))
                            .lineLimit(1)
                        Spacer()
                        Text(context.state.status)
                            .font(.caption.weight(.black))
                            .foregroundStyle(accent)
                    }
                }
            } compactLeading: {
                Text("\(context.state.homeScore)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white)
            } compactTrailing: {
                Text("\(context.state.awayScore)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(accent)
            } minimal: {
                Text(context.state.isPregame ? "G" : context.state.scoreText)
                    .font(.caption2.weight(.black))
                    .foregroundStyle(accent)
            }
            .widgetURL(URL(string: "https://ground-alpha.vercel.app/today"))
        }
    }
}

@main
struct GroundLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        GroundLiveActivityWidget()
    }
}

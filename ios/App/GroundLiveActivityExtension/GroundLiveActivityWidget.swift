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
}

private struct ScoreColumn: View {
    let team: String
    let score: Int
    let alignTrailing: Bool

    var body: some View {
        VStack(alignment: alignTrailing ? .trailing : .leading, spacing: 4) {
            Text(team)
                .font(.caption.weight(.bold))
                .foregroundStyle(.white.opacity(0.58))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text("\(score)")
                .font(.system(size: 46, weight: .black, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: alignTrailing ? .trailing : .leading)
    }
}

struct GroundLiveActivityLockScreenView: View {
    let context: ActivityViewContext<GroundGameAttributes>

    var body: some View {
        let state = context.state
        let accent = context.attributes.accent

        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.015, green: 0.017, blue: 0.026),
                    Color(red: 0.028, green: 0.031, blue: 0.045),
                    accent.opacity(0.24)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            GeometryReader { proxy in
                Circle()
                    .fill(accent.opacity(0.26))
                    .blur(radius: 34)
                    .frame(width: proxy.size.width * 0.62, height: proxy.size.width * 0.62)
                    .offset(x: proxy.size.width * 0.5, y: -proxy.size.width * 0.42)

                Rectangle()
                    .fill(accent.opacity(0.95))
                    .frame(width: 5)
                    .frame(maxHeight: .infinity)
                    .offset(x: 0, y: 0)
            }

            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center, spacing: 9) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(accent)
                        Text("G")
                            .font(.caption.weight(.black))
                            .foregroundStyle(.black.opacity(0.82))
                    }
                    .frame(width: 26, height: 26)

                    VStack(alignment: .leading, spacing: 1) {
                        Text("GROUND")
                            .font(.caption2.weight(.black))
                            .tracking(1.4)
                            .foregroundStyle(.white.opacity(0.88))
                        Text(context.attributes.matchupText)
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(.white.opacity(0.62))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 4) {
                        Text(state.phaseLabel)
                            .font(.caption2.weight(.black))
                            .tracking(1)
                            .foregroundStyle(accent)
                        Text(state.inning)
                            .font(.subheadline.weight(.heavy))
                            .foregroundStyle(.white)
                    }
                }

                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    ScoreColumn(team: context.attributes.homeTeam, score: state.homeScore, alignTrailing: false)

                    Text(":")
                        .font(.system(size: 34, weight: .black, design: .rounded))
                        .foregroundStyle(.white.opacity(0.28))
                        .padding(.bottom, 4)

                    ScoreColumn(team: context.attributes.awayTeam, score: state.awayScore, alignTrailing: true)
                }

                HStack(alignment: .center, spacing: 8) {
                    if state.isFinal {
                        if let result = state.resultLabel {
                            Text(result)
                                .font(.caption.weight(.black))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
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

                    Spacer()

                    Text(state.status)
                        .font(.caption.weight(.black))
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.white.opacity(0.08)))
                        .overlay(Capsule().stroke(accent.opacity(0.42), lineWidth: 1))
                        .foregroundStyle(.white.opacity(0.9))
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.62))
            }
            .padding(.leading, 19)
            .padding(.trailing, 16)
            .padding(.vertical, 15)
        }
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
                        Text(context.state.inning)
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

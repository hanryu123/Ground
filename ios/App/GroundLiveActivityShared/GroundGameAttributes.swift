import Foundation
import ActivityKit

struct GroundGameAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var phase: String
        var status: String
        var inning: String
        var homeScore: Int
        var awayScore: Int
        var resultLabel: String?
        var winningPitcher: String?
        var losingPitcher: String?
        var updatedAtEpochMs: Double
    }

    var gameId: String
    var teamId: String
    var homeTeam: String
    var awayTeam: String
    var homePitcher: String?
    var awayPitcher: String?
    var stadium: String?
    var gameStartEpochMs: Double?
}

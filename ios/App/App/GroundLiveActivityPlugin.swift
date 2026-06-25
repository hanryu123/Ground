import Foundation
import Capacitor

#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(GroundLiveActivityPlugin)
public class GroundLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GroundLiveActivity"
    public let jsName = "GroundLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    private let storedActivityIdKey = "ground.liveActivity.stage.activityId"

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            let info = ActivityAuthorizationInfo()
            call.resolve([
                "available": info.areActivitiesEnabled,
                "platform": "ios",
                "activitiesEnabled": info.areActivitiesEnabled,
                "reason": info.areActivitiesEnabled ? NSNull() : "activities_disabled"
            ])
            return
        }
        #endif
        call.resolve([
            "available": false,
            "platform": "ios",
            "activitiesEnabled": false,
            "reason": "ios_16_2_required"
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.reject("activities_disabled")
                return
            }
            guard let attributes = buildAttributes(call),
                  let state = buildState(call) else {
                call.reject("invalid_payload")
                return
            }
            let subscribeUrl = call.getString("subscribeUrl")

            Task {
                do {
                    await endExistingStageActivity()
                    let content = ActivityContent(
                        state: state,
                        staleDate: Date(timeIntervalSinceNow: 10 * 60)
                    )
                    let activity = try Activity<GroundGameAttributes>.request(
                        attributes: attributes,
                        content: content,
                        pushType: .token
                    )
                    UserDefaults.standard.set(activity.id, forKey: storedActivityIdKey)
                    observePushTokenUpdates(
                        activity: activity,
                        attributes: attributes,
                        subscribeUrl: subscribeUrl
                    )
                    call.resolve(["ok": true, "activityId": activity.id])
                } catch {
                    call.reject(error.localizedDescription)
                }
            }
            return
        }
        #endif
        call.reject("ios_16_2_required")
    }

    @objc func update(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard let state = buildState(call) else {
                call.reject("invalid_payload")
                return
            }

            Task {
                guard let activity = findStageActivity() else {
                    call.reject("activity_not_started")
                    return
                }
                let content = ActivityContent(
                    state: state,
                    staleDate: Date(timeIntervalSinceNow: 10 * 60)
                )
                await activity.update(content)
                call.resolve(["ok": true, "activityId": activity.id])
            }
            return
        }
        #endif
        call.reject("ios_16_2_required")
    }

    @objc func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard let state = buildState(call) else {
                call.reject("invalid_payload")
                return
            }

            Task {
                guard let activity = findStageActivity() else {
                    call.resolve(["ok": true, "activityId": NSNull()])
                    return
                }
                let content = ActivityContent(state: state, staleDate: nil)
                await activity.end(content, dismissalPolicy: .after(Date(timeIntervalSinceNow: 30 * 60)))
                UserDefaults.standard.removeObject(forKey: storedActivityIdKey)
                call.resolve(["ok": true, "activityId": activity.id])
            }
            return
        }
        #endif
        call.reject("ios_16_2_required")
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private func buildAttributes(_ call: CAPPluginCall) -> GroundGameAttributes? {
        guard let gameId = call.getString("gameId"),
              let teamId = call.getString("teamId"),
              let homeTeam = call.getString("homeTeam"),
              let awayTeam = call.getString("awayTeam") else {
            return nil
        }
        return GroundGameAttributes(
            gameId: gameId,
            teamId: teamId,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            stadium: call.getString("stadium"),
            gameStartEpochMs: call.getDouble("gameStartEpochMs")
        )
    }

    @available(iOS 16.2, *)
    private func buildState(_ call: CAPPluginCall) -> GroundGameAttributes.ContentState? {
        guard let phase = call.getString("phase"),
              let status = call.getString("status"),
              let inning = call.getString("inning") else {
            return nil
        }
        return GroundGameAttributes.ContentState(
            phase: phase,
            status: status,
            inning: inning,
            homeScore: call.getInt("homeScore") ?? 0,
            awayScore: call.getInt("awayScore") ?? 0,
            resultLabel: call.getString("resultLabel"),
            winningPitcher: call.getString("winningPitcher"),
            losingPitcher: call.getString("losingPitcher"),
            updatedAtEpochMs: call.getDouble("updatedAtEpochMs") ?? Date().timeIntervalSince1970 * 1000
        )
    }

    @available(iOS 16.2, *)
    private func findStageActivity() -> Activity<GroundGameAttributes>? {
        let storedId = UserDefaults.standard.string(forKey: storedActivityIdKey)
        if let storedId,
           let activity = Activity<GroundGameAttributes>.activities.first(where: { $0.id == storedId }) {
            return activity
        }
        return Activity<GroundGameAttributes>.activities.first
    }

    @available(iOS 16.2, *)
    private func endExistingStageActivity() async {
        guard let activity = findStageActivity() else { return }
        await activity.end(nil, dismissalPolicy: .immediate)
        UserDefaults.standard.removeObject(forKey: storedActivityIdKey)
    }

    @available(iOS 16.2, *)
    private func observePushTokenUpdates(
        activity: Activity<GroundGameAttributes>,
        attributes: GroundGameAttributes,
        subscribeUrl: String?
    ) {
        Task { [weak self] in
            for await tokenData in activity.pushTokenUpdates {
                guard let self else { return }
                await self.postLiveActivityToken(
                    token: self.hexString(from: tokenData),
                    activityId: activity.id,
                    gameId: attributes.gameId,
                    teamId: attributes.teamId,
                    subscribeUrl: subscribeUrl
                )
            }
        }
    }

    private func hexString(from data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    private func postLiveActivityToken(
        token: String,
        activityId: String,
        gameId: String,
        teamId: String,
        subscribeUrl: String?
    ) async {
        guard let subscribeUrl,
              let url = URL(string: subscribeUrl) else {
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "token": token,
            "activityId": activityId,
            "gameId": gameId,
            "teamId": teamId,
        ])

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse,
               http.statusCode < 200 || http.statusCode >= 300 {
                NSLog("[GroundLiveActivity] token subscribe failed: %d", http.statusCode)
            }
        } catch {
            NSLog("[GroundLiveActivity] token subscribe error: %@", error.localizedDescription)
        }
    }
    #endif
}

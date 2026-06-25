import Foundation
import Capacitor
import UIKit

#if canImport(ActivityKit)
import ActivityKit
#endif

#if canImport(ActivityKit)
enum GroundLiveActivityNativeCoordinator {
    private static let storedActivityIdKey = "ground.liveActivity.stage.activityId"

    static func handleRemoteNotification(userInfo: [AnyHashable: Any]) async -> Bool {
        guard let ground = userInfo["ground"] as? [String: Any],
              (ground["kind"] as? String) == "live-activity-start",
              let payload = ground["payload"] as? [String: Any] else {
            return false
        }

        if #available(iOS 16.2, *) {
            do {
                _ = try await start(payload: payload)
                return true
            } catch {
                NSLog("[GroundLiveActivity] silent start failed: %@", error.localizedDescription)
                return false
            }
        }
        return false
    }

    @available(iOS 16.2, *)
    static func start(payload: [String: Any]) async throws -> String {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            throw NSError(domain: "GroundLiveActivity", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "activities_disabled"
            ])
        }
        guard let attributes = buildAttributes(payload),
              let state = buildState(payload) else {
            throw NSError(domain: "GroundLiveActivity", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "invalid_payload"
            ])
        }

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
            subscribeUrl: string(payload, "subscribeUrl")
        )
        return activity.id
    }

    @available(iOS 16.2, *)
    private static func buildAttributes(_ payload: [String: Any]) -> GroundGameAttributes? {
        guard let gameId = string(payload, "gameId"),
              let teamId = string(payload, "teamId"),
              let homeTeam = string(payload, "homeTeam"),
              let awayTeam = string(payload, "awayTeam") else {
            return nil
        }
        return GroundGameAttributes(
            gameId: gameId,
            teamId: teamId,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            stadium: string(payload, "stadium"),
            gameStartEpochMs: double(payload, "gameStartEpochMs")
        )
    }

    @available(iOS 16.2, *)
    private static func buildState(_ payload: [String: Any]) -> GroundGameAttributes.ContentState? {
        guard let phase = string(payload, "phase"),
              let status = string(payload, "status"),
              let inning = string(payload, "inning") else {
            return nil
        }
        return GroundGameAttributes.ContentState(
            phase: phase,
            status: status,
            inning: inning,
            homeScore: int(payload, "homeScore") ?? 0,
            awayScore: int(payload, "awayScore") ?? 0,
            resultLabel: string(payload, "resultLabel"),
            winningPitcher: string(payload, "winningPitcher"),
            losingPitcher: string(payload, "losingPitcher"),
            updatedAtEpochMs: double(payload, "updatedAtEpochMs") ?? Date().timeIntervalSince1970 * 1000
        )
    }

    @available(iOS 16.2, *)
    private static func findStageActivity() -> Activity<GroundGameAttributes>? {
        let storedId = UserDefaults.standard.string(forKey: storedActivityIdKey)
        if let storedId,
           let activity = Activity<GroundGameAttributes>.activities.first(where: { $0.id == storedId }) {
            return activity
        }
        return Activity<GroundGameAttributes>.activities.first
    }

    @available(iOS 16.2, *)
    private static func endExistingStageActivity() async {
        guard let activity = findStageActivity() else { return }
        await activity.end(nil, dismissalPolicy: .immediate)
        UserDefaults.standard.removeObject(forKey: storedActivityIdKey)
    }

    @available(iOS 16.2, *)
    private static func observePushTokenUpdates(
        activity: Activity<GroundGameAttributes>,
        attributes: GroundGameAttributes,
        subscribeUrl: String?
    ) {
        Task {
            for await tokenData in activity.pushTokenUpdates {
                await postLiveActivityToken(
                    token: hexString(from: tokenData),
                    activityId: activity.id,
                    gameId: attributes.gameId,
                    teamId: attributes.teamId,
                    subscribeUrl: subscribeUrl
                )
            }
        }
    }

    private static func postLiveActivityToken(
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

    private static func string(_ payload: [String: Any], _ key: String) -> String? {
        if let value = payload[key] as? String, !value.isEmpty { return value }
        return nil
    }

    private static func int(_ payload: [String: Any], _ key: String) -> Int? {
        if let value = payload[key] as? Int { return value }
        if let value = payload[key] as? Double { return Int(value) }
        if let value = payload[key] as? NSNumber { return value.intValue }
        if let value = payload[key] as? String { return Int(value) }
        return nil
    }

    private static func double(_ payload: [String: Any], _ key: String) -> Double? {
        if let value = payload[key] as? Double { return value }
        if let value = payload[key] as? Int { return Double(value) }
        if let value = payload[key] as? NSNumber { return value.doubleValue }
        if let value = payload[key] as? String { return Double(value) }
        return nil
    }

    private static func hexString(from data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}
#else
enum GroundLiveActivityNativeCoordinator {
    static func handleRemoteNotification(userInfo: [AnyHashable: Any]) async -> Bool {
        return false
    }
}
#endif

@objc(GroundLiveActivityPlugin)
public class GroundLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GroundLiveActivity"
    public let jsName = "GroundLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
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

    @objc func openSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("settings_url_unavailable")
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { success in
                call.resolve(["ok": success])
            }
        }
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

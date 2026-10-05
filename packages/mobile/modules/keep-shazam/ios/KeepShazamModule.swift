import ExpoModulesCore
import AVFoundation
import ShazamKit

public class KeepShazamModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KeepShazam")

    Function("isAvailable") { () -> Bool in
      return true
    }

    AsyncFunction("recognizeBase64") { (base64: String, promise: Promise) in
      Task {
        do {
          let result = try await self.recognizeBase64(base64)
          promise.resolve(result)
        } catch {
          promise.reject("E_KEEP_SHAZAM", error.localizedDescription)
        }
      }
    }
  }

  /// Identifiant stable du morceau reconnu.
  /// `SHMediaItem.id` n'est disponible qu'à partir d'iOS 17 : on le protège par
  /// un guard `@available` et on retombe sur les identifiants compatibles iOS 16
  /// (shazamID, appleMusicID) puis, en dernier recours, sur un UUID généré.
  private func stableTrackId(for item: SHMediaItem) -> String {
    if let shazamID = item.shazamID, !shazamID.isEmpty {
      return shazamID
    }
    if #available(iOS 17.0, *) {
      return item.id.uuidString
    }
    if let appleMusicID = item.appleMusicID, !appleMusicID.isEmpty {
      return appleMusicID
    }
    return UUID().uuidString
  }

  private func recognizeBase64(_ base64: String) async throws -> [String: Any]? {
    guard let data = Data(base64Encoded: base64), !data.isEmpty else {
      throw NSError(domain: "KeepShazam", code: 1, userInfo: [NSLocalizedDescriptionKey: "Échantillon audio ShazamKit invalide."])
    }

    let tempURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("keep-shazam-\(UUID().uuidString)")
      .appendingPathExtension("m4a")
    try data.write(to: tempURL, options: .atomic)
    defer { try? FileManager.default.removeItem(at: tempURL) }

    let audioFile = try AVAudioFile(forReading: tempURL)
    let frameCount = AVAudioFrameCount(max(1, min(Int64(UInt32.max), audioFile.length)))
    guard let buffer = AVAudioPCMBuffer(pcmFormat: audioFile.processingFormat, frameCapacity: frameCount) else {
      throw NSError(domain: "KeepShazam", code: 2, userInfo: [NSLocalizedDescriptionKey: "Impossible de décoder l’échantillon audio."])
    }
    try audioFile.read(into: buffer)
    guard buffer.frameLength > 0 else { return nil }

    let generator = SHSignatureGenerator()
    let audioTime = AVAudioTime(sampleTime: 0, atRate: audioFile.processingFormat.sampleRate)
    try generator.append(buffer, at: audioTime)
    let signature = generator.signature()
    guard let match = try await self.matchSignature(signature) else { return nil }
    do {
      guard let item = match.mediaItems.first,
            let title = item.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty,
            let artist = item.artist?.trimmingCharacters(in: .whitespacesAndNewlines), !artist.isEmpty else {
        return nil
      }

      var payload: [String: Any] = [
        "confidence": 0.99,
        "title": title,
        "artist": artist,
        "recognitionProviderTrackId": self.stableTrackId(for: item),
        "genres": item.genres,
      ]
      if let isrc = item.isrc, !isrc.isEmpty { payload["isrc"] = isrc }
      if let artworkURL = item.artworkURL { payload["artworkUrl"] = artworkURL.absoluteString }
      if let appleMusicID = item.appleMusicID, !appleMusicID.isEmpty {
        payload["providerIds"] = ["appleMusic": appleMusicID]
      }
      var externalURLs: [String: String] = [:]
      if let appleMusicURL = item.appleMusicURL { externalURLs["appleMusic"] = appleMusicURL.absoluteString }
      if let webURL = item.webURL { externalURLs["shazam"] = webURL.absoluteString }
      if !externalURLs.isEmpty { payload["externalUrls"] = externalURLs }
      payload["availableOn"] = item.appleMusicID == nil ? ["Shazam"] : ["Shazam", "Apple Music"]
      return payload
    }
  }

  /// Reconnaissance d'une signature, compatible iOS 15.1 (deploymentTarget de l'app).
  /// `SHSession.result(from:)` n'existe qu'à partir d'iOS 16 : sans ce garde,
  /// Xcode refuse de compiler (build TestFlight #162 du 04/10/2026 en échec).
  /// iOS 16+ : API async native. iOS 15 : API délégué `match(_:)` d'iOS 15.
  private func matchSignature(_ signature: SHSignature) async throws -> SHMatch? {
    if #available(iOS 16.0, *) {
      switch await SHSession().result(from: signature) {
      case .match(let match): return match
      case .noMatch: return nil
      case .error(let error, _): throw error
      @unknown default: return nil
      }
    }
    return try await KeepShazamLegacyMatcher().match(signature)
  }
}

/// Repli iOS 15 : `SHSession` + délégué, converti en async. Une seule réponse
/// est transmise (garde `finished`), la session reste retenue jusqu'à la fin.
private final class KeepShazamLegacyMatcher: NSObject, SHSessionDelegate {
  private let session = SHSession()
  private var continuation: CheckedContinuation<SHMatch?, Error>?
  private var finished = false
  private var keepAlive: KeepShazamLegacyMatcher?

  func match(_ signature: SHSignature) async throws -> SHMatch? {
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<SHMatch?, Error>) in
      self.continuation = cont
      self.keepAlive = self
      self.session.delegate = self
      self.session.match(signature)
    }
  }

  private func finish(_ result: Result<SHMatch?, Error>) {
    guard !finished else { return }
    finished = true
    continuation?.resume(with: result)
    continuation = nil
    session.delegate = nil
    keepAlive = nil
  }

  func session(_ session: SHSession, didFind match: SHMatch) {
    finish(.success(match))
  }

  func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
    if let error = error {
      let nsError = error as NSError
      // Pas de correspondance n'est pas une panne : même sémantique que `.noMatch`.
      if nsError.domain == SHErrorDomain && nsError.code == SHError.Code.matchAttemptFailed.rawValue {
        finish(.success(nil))
      } else {
        finish(.failure(error))
      }
    } else {
      finish(.success(nil))
    }
  }
}

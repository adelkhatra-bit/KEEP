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
    let result = await SHSession().result(from: signature)

    switch result {
    case .match(let match):
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

    case .noMatch:
      return nil

    case .error(let error, _):
      throw error

    @unknown default:
      return nil
    }
  }
}

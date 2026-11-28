import Foundation

private func rawNowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

/**
 受信機の出力と、NTRIPで受け取った補正を、加工せずにファイルへ書き出す（後処理（PPK）用）。Android版と同じ動き。

 - 受信機の出力は `<base>.raw` に書き、停止時にUBXの同期バイト（B5 62）を見ていれば `<base>.ubx` に改名する。
 - 補正は最初に届いたときに `<base>.rtcm3` を作る。
 - 書き込みは呼び出し元のスレッドでバッファに足すだけにし、ディスクへは専用キューで1秒ごとに書き出す。
 - 書けなくなったら（空き容量不足など）記録を止め、onError で知らせる。
 */
final class RawLogger {
  private static let flushInterval: TimeInterval = 1.0

  let baseName: String
  let startedAt: Double = rawNowMs()
  private let dir: URL
  private let logCorrections: Bool
  private let onError: (String) -> Void
  private let onFlushed: () -> Void
  private let lock = NSLock()
  private let queue = DispatchQueue(label: "GnssReceiver.rawLog")
  private let roverURL: URL
  private let correctionURL: URL
  private var rover: FileHandle?
  private var correction: FileHandle?
  private var roverBuffer = Data()
  private var correctionBuffer = Data()
  private var closed = false
  private var prevByte: Int = -1
  private var timer: DispatchSourceTimer?

  private(set) var roverBytes: Double = 0
  private(set) var correctionBytes: Double = 0
  private(set) var sawUbx = false

  init(
    dir: URL, baseName: String, logCorrections: Bool,
    onError: @escaping (String) -> Void, onFlushed: @escaping () -> Void
  ) throws {
    self.dir = dir
    self.baseName = baseName
    self.logCorrections = logCorrections
    self.onError = onError
    self.onFlushed = onFlushed
    roverURL = dir.appendingPathComponent("\(baseName).raw")
    correctionURL = dir.appendingPathComponent("\(baseName).rtcm3")
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      FileManager.default.createFile(atPath: roverURL.path, contents: nil)
      rover = try FileHandle(forWritingTo: roverURL)
    } catch {
      throw GnssError("Could not create the raw log: \(error.localizedDescription)")
    }
    let t = DispatchSource.makeTimerSource(queue: queue)
    t.schedule(deadline: .now() + Self.flushInterval, repeating: Self.flushInterval)
    t.setEventHandler { [weak self] in
      guard let self else { return }
      if self.flush() { self.onFlushed() }
    }
    t.resume()
    timer = t
  }

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  var status: (roverBytes: Double, correctionBytes: Double, sawUbx: Bool) {
    locked { (roverBytes, correctionBytes, sawUbx) }
  }

  func writeRover(_ data: Data) {
    locked {
      if closed { return }
      if !sawUbx {
        for byte in data {
          let b = Int(byte)
          if prevByte == 0xB5 && b == 0x62 {
            sawUbx = true
            break
          }
          prevByte = b
        }
      }
      roverBuffer.append(data)
      roverBytes += Double(data.count)
    }
  }

  func writeCorrection(_ data: Data) {
    if !logCorrections { return }
    locked {
      if closed { return }
      correctionBuffer.append(data)
      correctionBytes += Double(data.count)
    }
  }

  /** バッファをディスクへ書き出す。続けてよければ true。queue の上でだけ呼ぶ */
  private func flush() -> Bool {
    let (roverChunk, correctionChunk, isClosed): (Data, Data, Bool) = locked {
      let r = roverBuffer
      let c = correctionBuffer
      roverBuffer = Data()
      correctionBuffer = Data()
      return (r, c, closed)
    }
    if isClosed { return false }
    do {
      if !roverChunk.isEmpty { try rover?.write(contentsOf: roverChunk) }
      if !correctionChunk.isEmpty {
        if correction == nil {
          FileManager.default.createFile(atPath: correctionURL.path, contents: nil)
          correction = try FileHandle(forWritingTo: correctionURL)
        }
        try correction?.write(contentsOf: correctionChunk)
      }
      return true
    } catch {
      locked { closed = true }
      closeHandles()
      timer?.cancel()
      // onError の先で stop() が呼ばれ、このキューで sync するので、別のキューから知らせる
      let message = error.localizedDescription
      DispatchQueue.global().async { [onError] in onError(message) }
      return false
    }
  }

  private func closeHandles() {
    try? rover?.close()
    try? correction?.close()
    rover = nil
    correction = nil
  }

  /** 記録を閉じて、残ったファイルの情報を返す */
  func stop() -> [String: Any] {
    // 残りを書き出してから閉じる（flush と同じキューで順に行う）
    queue.sync {
      timer?.cancel()
      timer = nil
      let alreadyClosed = locked { closed }
      if !alreadyClosed {
        _ = flush()
        locked { closed = true }
        closeHandles()
      }
    }
    var roverPath = roverURL
    if locked({ sawUbx }) {
      let renamed = dir.appendingPathComponent("\(baseName).ubx")
      if (try? FileManager.default.moveItem(at: roverURL, to: renamed)) != nil { roverPath = renamed }
    }
    let (rBytes, cBytes, ubx) = status
    let hasCorrection = FileManager.default.fileExists(atPath: correctionURL.path)
    return [
      "baseName": baseName,
      "roverPath": roverPath.path,
      "correctionPath": hasCorrection ? correctionURL.path : NSNull(),
      "roverBytes": rBytes,
      "correctionBytes": cBytes,
      "sawUbx": ubx,
      "startedAt": startedAt,
      "endedAt": rawNowMs(),
    ]
  }
}

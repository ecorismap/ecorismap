import Foundation

/** 受信機との双方向リンク。iOSではBLEだけだが、Android（USB・BLE）と同じ形にしておく */
protocol GnssLink: AnyObject {
  var name: String { get }
  func write(_ data: Data)
  func close()
}

/** JSへ見せるエラー文。Android版と同じ英文をそのまま出す */
struct GnssError: Error, CustomStringConvertible {
  let message: String
  init(_ message: String) { self.message = message }
  var description: String { message }
}

func errorMessage(_ error: Error) -> String {
  if let e = error as? GnssError { return e.message }
  return error.localizedDescription
}

private func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

/**
 受信機リンクとNTRIPクライアントを束ねる。プロセスに1つだけ置く。

 補正の中継（キャスター→受信機）とGGAの返送（受信機→キャスター）はここで完結させ、
 JSには位置の解釈に要るNMEA文だけを間引いて渡す。
 */
final class GnssSession {
  static let shared = GnssSession()

  // 10Hz出力でもJSへのイベントは秒間数回に抑える
  private static let flushInterval: TimeInterval = 0.2
  private static let maxPending = 200
  private static let correctionStatusIntervalMs: Double = 1000

  private let lock = NSLock()
  private var onSentences: (([String], Double) -> Void)?
  private var onStatus: (([String: Any]) -> Void)?
  private var link: GnssLink?
  private var linkState = "disconnected"
  private var linkError: String?
  private var ntrip: NtripClient?
  private var ntripState = "off"
  private var ntripError: String?
  // 止めた後の古いクライアントからの通知を見分ける
  private var ntripGeneration = 0
  private var rtcmBytes: Double = 0
  private var lastCorrectionAt: Double = 0
  private var lastGga: String?
  private var lastCorrectionStatusAt: Double = 0

  private let flushQueue = DispatchQueue(label: "GnssReceiver.flush")
  private var pending: [String] = [] // flushQueueでのみ触る
  private var flushScheduled = false

  private let assemblerLock = NSLock()
  private lazy var assembler = NmeaLineAssembler { [weak self] sentence in self?.onSentence(sentence) }

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  func setListener(onSentences: (([String], Double) -> Void)?, onStatus: (([String: Any]) -> Void)?) {
    locked {
      self.onSentences = onSentences
      self.onStatus = onStatus
    }
  }

  func status() -> [String: Any] {
    locked { statusLocked() }
  }

  private func statusLocked() -> [String: Any] {
    [
      "link": linkState,
      "linkName": link?.name ?? NSNull(),
      "linkError": linkError ?? NSNull(),
      "ntrip": ntripState,
      "ntripError": ntripError ?? NSNull(),
      "rtcmBytes": rtcmBytes,
      "lastCorrectionAt": lastCorrectionAt,
    ]
  }

  private func emitStatus() {
    let (listener, status) = locked { (onStatus, statusLocked()) }
    listener?(status)
  }

  func attachLink(
    _ factory: (_ onData: @escaping (Data) -> Void, _ onError: @escaping (String) -> Void) throws -> GnssLink
  ) throws {
    detachLink()
    locked {
      linkState = "connecting"
      linkError = nil
    }
    emitStatus()
    var created: GnssLink?
    do {
      let made = try factory(
        { [weak self] data in self?.feed(data) },
        { [weak self] message in self?.onLinkError(source: created, message: message) }
      )
      created = made
      locked {
        link = made
        linkState = "connected"
      }
    } catch {
      locked {
        linkState = "disconnected"
        linkError = errorMessage(error)
      }
      emitStatus()
      throw error
    }
    emitStatus()
  }

  private func feed(_ data: Data) {
    assemblerLock.lock()
    defer { assemblerLock.unlock() }
    assembler.feed(data)
  }

  private func onLinkError(source: GnssLink?, message: String) {
    let ignored: Bool = locked {
      // 自分で閉じたリンクの切断通知や、差し替え前の古いリンクからの通知は無視する
      guard let source, source === link else { return true }
      link = nil
      linkState = "disconnected"
      linkError = message
      lastGga = nil
      return false
    }
    if ignored { return }
    source?.close()
    emitStatus()
  }

  func detachLink() {
    let old: GnssLink? = locked {
      let l = link
      link = nil
      linkState = "disconnected"
      linkError = nil
      lastGga = nil
      return l
    }
    if let old {
      old.close()
      emitStatus()
    }
  }

  func startNtrip(_ config: NtripConfig) {
    stopNtrip()
    let generation: Int = locked {
      rtcmBytes = 0
      lastCorrectionAt = 0
      ntripError = nil
      ntripGeneration += 1
      return ntripGeneration
    }
    let client = NtripClient(
      config: config,
      onState: { [weak self] state, message in
        guard let self else { return }
        let current: Bool = self.locked {
          guard self.ntripGeneration == generation, self.ntrip != nil else { return false }
          self.ntripState = state
          if state == "error" { self.ntripError = message } else if state == "connected" { self.ntripError = nil }
          return true
        }
        if current { self.emitStatus() }
      },
      onCorrection: { [weak self] data in self?.relayCorrection(data) },
      latestGga: { [weak self] in
        guard let self else { return nil }
        return self.locked { self.lastGga }
      }
    )
    locked { ntrip = client }
    client.start()
  }

  private func relayCorrection(_ data: Data) {
    let now = nowMs()
    let (target, shouldEmit): (GnssLink?, Bool) = locked {
      rtcmBytes += Double(data.count)
      lastCorrectionAt = now
      // 受信量の表示を更新する（補正は秒間数回届くので、通知は1秒に1回に間引く）
      let emit = now - lastCorrectionStatusAt >= Self.correctionStatusIntervalMs
      if emit { lastCorrectionStatusAt = now }
      return (link, emit)
    }
    if shouldEmit { emitStatus() }
    target?.write(data)
  }

  func stopNtrip() {
    let old: NtripClient? = locked {
      let c = ntrip
      ntrip = nil
      ntripState = "off"
      ntripGeneration += 1
      return c
    }
    old?.stop()
    emitStatus()
  }

  private func onSentence(_ sentence: String) {
    // "$GNGGA,..." の文種（トーカーを除く3文字）だけを見て、位置の解釈に要るものだけを渡す
    let chars = Array(sentence.utf8)
    if chars.count < 7 { return }
    let type = String(decoding: chars[3..<6], as: UTF8.self)
    if type == "GGA" {
      // 測位できていない（緯度が空の）GGAをVRSに送ると拒否されるので、位置のあるものだけ残す
      let fields = sentence.split(separator: ",", omittingEmptySubsequences: false)
      if fields.count > 6 && !fields[2].isEmpty && fields[6] != "0" {
        locked { lastGga = sentence }
      }
    }
    if type != "GGA" && type != "RMC" && type != "GST" { return }
    flushQueue.async { [self] in
      pending.append(sentence)
      if pending.count > Self.maxPending { pending.removeFirst(pending.count - Self.maxPending) }
      if !flushScheduled {
        flushScheduled = true
        flushQueue.asyncAfter(deadline: .now() + Self.flushInterval) { [self] in flush() }
      }
    }
  }

  private func flush() {
    flushScheduled = false
    let batch = pending
    pending.removeAll()
    if batch.isEmpty { return }
    let listener = locked { onSentences }
    listener?(batch, nowMs())
  }
}

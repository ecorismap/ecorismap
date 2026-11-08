import Foundation
import Network

struct NtripConfig {
  let host: String
  let port: Int
  let mountpoint: String
  let username: String
  let password: String
  /** "v1"（HTTP/1.0＋ICY応答）または"v2"（HTTP/1.1、chunked転送あり） */
  let version: String
  /** VRS等、受信機の概略位置（GGA）を送らないと補正を配信しないキャスター向け */
  let sendGga: Bool
  let ggaIntervalSec: Int
}

private let userAgent = "NTRIP EcorisMap/1.0"
private let connectTimeout: TimeInterval = 10
// 補正はふつう1秒ごとに届く。これだけ途絶えたら接続が死んだとみなして張り直す
private let readTimeout: TimeInterval = 30
private let maxHeaderBytes = 8192

/** 読み取りが時間内に何も受け取らなかった */
private struct ReadTimeout: Error {}

/**
 NWConnectionを、Android版（java.net.Socket）と同じように呼び出し側のスレッドで待つ形で使う。
 受信は常に1件だけ予約しておき、届いたぶんを溜めて read() で取り出す。
 */
private final class TcpConnection {
  private let connection: NWConnection
  private let queue = DispatchQueue(label: "GnssReceiver.ntrip.tcp")
  private let condition = NSCondition()
  private var inbox = Data()
  private var eof = false
  private var failure: String?

  init(host: String, port: Int) throws {
    guard let p = NWEndpoint.Port(rawValue: UInt16(clamping: port)) else { throw GnssError("invalid port") }
    connection = NWConnection(host: NWEndpoint.Host(host), port: p, using: .tcp)
  }

  func open() throws {
    let ready = DispatchSemaphore(value: 0)
    let stateLock = NSLock()
    var openError: String?
    var signaled = false
    let finish = { (message: String?) in
      stateLock.lock()
      defer { stateLock.unlock() }
      if signaled { return }
      signaled = true
      openError = message
      ready.signal()
    }
    connection.stateUpdateHandler = { [weak self] state in
      switch state {
      case .ready:
        finish(nil)
      // 名前解決できない・圏外などは.waitingのまま待ち続けるので、失敗として扱って張り直しに任せる
      case .waiting(let error), .failed(let error):
        finish(error.localizedDescription)
        self?.markFailed(error.localizedDescription)
      case .cancelled:
        finish("connection cancelled")
        self?.markFailed("connection cancelled")
      default:
        break
      }
    }
    connection.start(queue: queue)
    if ready.wait(timeout: .now() + connectTimeout) == .timedOut {
      close()
      throw GnssError("connection timed out")
    }
    stateLock.lock()
    let message = openError
    stateLock.unlock()
    if let message {
      close()
      throw GnssError(message)
    }
    receiveNext()
  }

  private func markFailed(_ message: String) {
    condition.lock()
    if failure == nil { failure = message }
    condition.broadcast()
    condition.unlock()
  }

  private func receiveNext() {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, isComplete, error in
      guard let self else { return }
      self.condition.lock()
      if let data, !data.isEmpty { self.inbox.append(data) }
      if let error, self.failure == nil { self.failure = error.localizedDescription }
      if isComplete { self.eof = true }
      let stop = self.eof || self.failure != nil
      self.condition.broadcast()
      self.condition.unlock()
      if !stop { self.receiveNext() }
    }
  }

  /** 届いたバイトを最大maxだけ返す。相手が閉じたらnil、時間内に何も来なければReadTimeout */
  func read(max: Int, timeout: TimeInterval) throws -> Data? {
    let deadline = Date().addingTimeInterval(timeout)
    condition.lock()
    defer { condition.unlock() }
    while inbox.isEmpty && !eof && failure == nil {
      if !condition.wait(until: deadline) { break }
    }
    if !inbox.isEmpty {
      let n = min(max, inbox.count)
      let out = Data(inbox.prefix(n))
      inbox.removeSubrange(inbox.startIndex..<inbox.startIndex + n)
      return out
    }
    if let failure { throw GnssError(failure) }
    if eof { return nil }
    throw ReadTimeout()
  }

  func send(_ data: Data) throws {
    let done = DispatchSemaphore(value: 0)
    var sendError: String?
    connection.send(content: data, completion: .contentProcessed { error in
      sendError = error?.localizedDescription
      done.signal()
    })
    if done.wait(timeout: .now() + connectTimeout) == .timedOut { throw GnssError("send timed out") }
    if let sendError { throw GnssError(sendError) }
  }

  func close() {
    connection.cancel()
    markFailed("connection closed")
  }
}

/** 応答を1バイトずつ・まとめて読む（ヘッダの解析とchunked転送の解読に使う） */
private final class ByteReader {
  let tcp: TcpConnection
  var timeout: TimeInterval = readTimeout
  private var buffer: [UInt8] = []
  private var pos = 0

  init(_ tcp: TcpConnection) { self.tcp = tcp }

  private func fill(timeout: TimeInterval) throws -> Bool {
    guard let data = try tcp.read(max: 16384, timeout: timeout) else { return false }
    buffer = [UInt8](data)
    pos = 0
    return true
  }

  func readByte() throws -> UInt8? {
    if pos >= buffer.count, try !fill(timeout: timeout) { return nil }
    defer { pos += 1 }
    return buffer[pos]
  }

  /** 次の2バイトがCRLFなら読み捨てる。すぐに届かなければ何もしない */
  func skipCrlfIfPresent() {
    if pos >= buffer.count {
      guard (try? fill(timeout: 1)) == true else { return }
    }
    // ICYの直後はCRLFがまとめて届くので、バッファにある範囲だけを見る
    if pos + 1 < buffer.count && buffer[pos] == UInt8(ascii: "\r") && buffer[pos + 1] == UInt8(ascii: "\n") {
      pos += 2
    }
  }

  func read(max: Int) throws -> [UInt8]? {
    if pos >= buffer.count, try !fill(timeout: timeout) { return nil }
    let n = min(max, buffer.count - pos)
    defer { pos += n }
    return Array(buffer[pos..<pos + n])
  }
}

/** 応答の本文。素のままか、chunked転送を解いたもの */
private protocol ResponseBody {
  /** 最大maxバイトを返す。終わりならnil、時間内に何も来なければReadTimeout */
  func read(max: Int) throws -> [UInt8]?
}

private final class PlainBody: ResponseBody {
  private let reader: ByteReader
  init(_ reader: ByteReader) { self.reader = reader }
  func read(max: Int) throws -> [UInt8]? { try reader.read(max: max) }
}

private final class ChunkedBody: ResponseBody {
  private let reader: ByteReader
  private var remaining = 0
  private var finished = false
  // 読み取りが時間切れで中断しても、読みかけのサイズ行を失わないように持っておく
  private var sizeLine: [UInt8] = []

  init(_ reader: ByteReader) { self.reader = reader }

  private func readChunkSize() throws -> Int {
    while true {
      guard let b = try reader.readByte() else { return -1 }
      if b == UInt8(ascii: "\n") {
        let text = String(decoding: sizeLine, as: UTF8.self)
        sizeLine.removeAll()
        let sizeText = text.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false).first
          .map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
        if sizeText.isEmpty { continue } // 前チャンク末尾のCRLF
        guard let size = Int(sizeText, radix: 16) else { throw GnssError("invalid chunk size") }
        return size
      }
      if b != UInt8(ascii: "\r") { sizeLine.append(b) }
    }
  }

  func read(max: Int) throws -> [UInt8]? {
    if finished { return nil }
    if remaining == 0 {
      let size = try readChunkSize()
      if size <= 0 {
        finished = true
        return nil
      }
      remaining = size
    }
    guard let bytes = try reader.read(max: min(max, remaining)) else { return nil }
    remaining -= bytes.count
    return bytes
  }
}

private func authorizationHeader(_ username: String, _ password: String) -> String? {
  if username.isEmpty && password.isEmpty { return nil }
  let token = Data("\(username):\(password)".utf8).base64EncodedString()
  return "Authorization: Basic \(token)\r\n"
}

private func buildRequest(_ config: NtripConfig, path: String) -> String {
  var s = ""
  if config.version == "v2" {
    s += "GET /\(path) HTTP/1.1\r\n"
    s += "Host: \(config.host):\(config.port)\r\n"
    s += "Ntrip-Version: Ntrip/2.0\r\n"
  } else {
    s += "GET /\(path) HTTP/1.0\r\n"
  }
  s += "User-Agent: \(userAgent)\r\n"
  if let auth = authorizationHeader(config.username, config.password) { s += auth }
  s += "Connection: close\r\n\r\n"
  return s
}

/** 応答ヘッダ（空行まで）を読む。ICY 200 OK は空行を伴わないこともあるので状態行だけで返す */
private func readHeader(_ reader: ByteReader) throws -> [String] {
  var lines: [String] = []
  var line: [UInt8] = []
  var total = 0
  while true {
    guard let b = try reader.readByte() else { break }
    total += 1
    if total > maxHeaderBytes { throw GnssError("response header too large") }
    if b == UInt8(ascii: "\n") {
      if line.last == UInt8(ascii: "\r") { line.removeLast() }
      let text = String(decoding: line, as: UTF8.self)
      line.removeAll()
      if text.isEmpty { break }
      lines.append(text)
      if lines.count == 1 && text.hasPrefix("ICY 200") {
        // v1キャスターは状態行の直後にRTCMを流し始めるものがある。続く空行があれば読み捨てる
        reader.skipCrlfIfPresent()
        break
      }
    } else {
      line.append(b)
    }
  }
  if lines.isEmpty { throw GnssError("empty response") }
  return lines
}

private func headerValue(_ lines: [String], _ name: String) -> String? {
  for l in lines.dropFirst() {
    guard let i = l.firstIndex(of: ":") else { continue }
    if l[..<i].trimmingCharacters(in: .whitespaces).caseInsensitiveCompare(name) == .orderedSame {
      return l[l.index(after: i)...].trimmingCharacters(in: .whitespaces)
    }
  }
  return nil
}

private func openStream(
  _ config: NtripConfig, path: String
) throws -> (TcpConnection, ByteReader, ResponseBody, [String]) {
  let tcp = try TcpConnection(host: config.host, port: config.port)
  do {
    try tcp.open()
    try tcp.send(Data(buildRequest(config, path: path).utf8))
    let reader = ByteReader(tcp)
    let header: [String]
    do {
      header = try readHeader(reader)
    } catch is ReadTimeout {
      throw GnssError("response timed out")
    }
    let chunked = headerValue(header, "Transfer-Encoding")?.range(of: "chunked", options: .caseInsensitive) != nil
    let body: ResponseBody = chunked ? ChunkedBody(reader) : PlainBody(reader)
    return (tcp, reader, body, header)
  } catch {
    tcp.close()
    throw error
  }
}

/** キャスターのソーステーブル（マウントポイント一覧）を本文のテキストのまま取得する */
func fetchSourceTable(_ config: NtripConfig) throws -> String {
  let (tcp, _, body, header) = try openStream(config, path: "")
  defer { tcp.close() }
  let status = header[0]
  if !status.hasPrefix("SOURCETABLE 200") && !status.contains(" 200") { throw GnssError(status) }
  var bytes: [UInt8] = []
  while true {
    let chunk: [UInt8]?
    do {
      chunk = try body.read(max: 4096)
    } catch is ReadTimeout {
      break
    }
    guard let chunk else { break }
    bytes.append(contentsOf: chunk)
    // 終端を確かめるため末尾だけ見る
    if String(decoding: bytes.suffix(chunk.count + 16), as: UTF8.self).contains("ENDSOURCETABLE") { break }
  }
  return String(bytes: bytes, encoding: .isoLatin1) ?? ""
}

/**
 キャスターへ接続し続け、受け取った補正を onCorrection へ流す。
 切断されたら間隔を延ばしながら張り直す。stop() で終了する。
 */
final class NtripClient {
  private let config: NtripConfig
  private let onState: (String, String?) -> Void
  private let onCorrection: (Data) -> Void
  /** キャスターへ送るGGA文（改行なし）。まだ測位できていなければnil */
  private let latestGga: () -> String?

  private let lock = NSLock()
  private var running = true
  private var tcp: TcpConnection?
  // 再試行の待ちを stop() ですぐに切り上げる
  private let stopSignal = DispatchSemaphore(value: 0)

  init(
    config: NtripConfig,
    onState: @escaping (String, String?) -> Void,
    onCorrection: @escaping (Data) -> Void,
    latestGga: @escaping () -> String?
  ) {
    self.config = config
    self.onState = onState
    self.onCorrection = onCorrection
    self.latestGga = latestGga
  }

  private var isRunning: Bool {
    lock.lock()
    defer { lock.unlock() }
    return running
  }

  func start() {
    let thread = Thread { [self] in runLoop() }
    thread.name = "NtripClient"
    thread.start()
  }

  func stop() {
    lock.lock()
    running = false
    let current = tcp
    lock.unlock()
    current?.close()
    stopSignal.signal()
  }

  private func runLoop() {
    var backoff: TimeInterval = 2
    while isRunning {
      var connection: TcpConnection?
      defer {
        connection?.close()
        lock.lock()
        tcp = nil
        lock.unlock()
      }
      do {
        onState("connecting", nil)
        let (t, reader, body, header) = try openStream(config, path: config.mountpoint)
        connection = t
        lock.lock()
        tcp = t
        let stillRunning = running
        lock.unlock()
        if !stillRunning { break }
        let status = header[0]
        if status.hasPrefix("ICY 200") || (status.hasPrefix("HTTP/") && status.contains(" 200")) {
          if headerValue(header, "Content-Type")?.range(of: "sourcetable", options: .caseInsensitive) != nil {
            throw GnssError("mountpoint not found")
          }
        } else if status.hasPrefix("SOURCETABLE") {
          throw GnssError("mountpoint not found")
        } else if status.contains(" 401") {
          throw GnssError("unauthorized")
        } else {
          throw GnssError(status)
        }
        onState("connected", nil)
        backoff = 2
        // VRSは最初のGGAを受け取るまで何も送ってこないので、読み取りを短い間隔で区切ってGGA送信の機会を作る
        reader.timeout = 1
        try stream(t, body)
      } catch {
        if !isRunning { break }
        let message = errorMessage(error)
        onState("error", message)
        // 認証やマウントポイントの誤りは再試行しても直らないので、少し長めに待つ
        let wait: TimeInterval = message == "unauthorized" ? 60 : backoff
        if stopSignal.wait(timeout: .now() + wait) == .success { break }
        backoff = min(backoff * 2, 60)
      }
    }
    onState("off", nil)
  }

  private func stream(_ t: TcpConnection, _ body: ResponseBody) throws {
    let ggaInterval = TimeInterval(max(config.ggaIntervalSec, 1))
    var lastGgaAt = Date.distantPast
    var lastDataAt = Date()
    while isRunning {
      if config.sendGga && Date().timeIntervalSince(lastGgaAt) >= ggaInterval, let gga = latestGga() {
        try t.send(Data("\(gga)\r\n".utf8))
        lastGgaAt = Date()
      }
      let bytes: [UInt8]?
      do {
        bytes = try body.read(max: 4096)
      } catch is ReadTimeout {
        if Date().timeIntervalSince(lastDataAt) > readTimeout { throw GnssError("no data") }
        continue
      }
      guard let bytes else { throw GnssError("connection closed") }
      if !bytes.isEmpty {
        lastDataAt = Date()
        onCorrection(Data(bytes))
      }
    }
  }
}

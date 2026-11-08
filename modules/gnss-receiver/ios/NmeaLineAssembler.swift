import Foundation

/**
 受信機からのバイト列をNMEA文（'$'〜改行）に切り出す。

 受信機はUBX等のバイナリも混ぜて出すことがあるため、'$'から始まり印字可能ASCIIだけで
 改行まで続いたものだけを1文として扱い、それ以外は捨てる。
 */
final class NmeaLineAssembler {
  // NMEA 0183の規定は82文字。独自拡張文でも余裕を持たせて打ち切る
  private static let maxSentenceLength = 256

  private let onSentence: (String) -> Void
  private var buffer: [UInt8] = []
  private var inSentence = false

  init(onSentence: @escaping (String) -> Void) {
    self.onSentence = onSentence
  }

  func feed(_ data: Data) {
    for c in data {
      if c == UInt8(ascii: "$") {
        buffer.removeAll(keepingCapacity: true)
        buffer.append(c)
        inSentence = true
      } else if !inSentence {
        continue
      } else if c == UInt8(ascii: "\r") || c == UInt8(ascii: "\n") {
        if buffer.count > 6 { onSentence(String(decoding: buffer, as: UTF8.self)) }
        buffer.removeAll(keepingCapacity: true)
        inSentence = false
      } else if (0x20...0x7e).contains(c) && buffer.count < Self.maxSentenceLength {
        buffer.append(c)
      } else {
        // バイナリ混入や長すぎる行は文として成立しないので捨てる
        buffer.removeAll(keepingCapacity: true)
        inSentence = false
      }
    }
  }
}

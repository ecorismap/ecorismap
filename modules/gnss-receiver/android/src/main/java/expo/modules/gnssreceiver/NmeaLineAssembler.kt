package expo.modules.gnssreceiver

/**
 * 受信機からのバイト列をNMEA文（'$'〜改行）に切り出す。
 *
 * 受信機はUBX等のバイナリも混ぜて出すことがあるため、'$'から始まり印字可能ASCIIだけで
 * 改行まで続いたものだけを1文として扱い、それ以外は捨てる。
 */
class NmeaLineAssembler(private val onSentence: (String) -> Unit) {
  private val buffer = StringBuilder()
  private var inSentence = false

  fun feed(bytes: ByteArray, length: Int = bytes.size) {
    for (i in 0 until length) {
      val c = bytes[i].toInt() and 0xff
      when {
        c == '$'.code -> {
          buffer.setLength(0)
          buffer.append('$')
          inSentence = true
        }
        !inSentence -> Unit
        c == '\r'.code || c == '\n'.code -> {
          if (buffer.length > 6) onSentence(buffer.toString())
          buffer.setLength(0)
          inSentence = false
        }
        c in 0x20..0x7e && buffer.length < MAX_SENTENCE_LENGTH -> buffer.append(c.toChar())
        else -> {
          // バイナリ混入や長すぎる行は文として成立しないので捨てる
          buffer.setLength(0)
          inSentence = false
        }
      }
    }
  }

  companion object {
    // NMEA 0183の規定は82文字。独自拡張文でも余裕を持たせて打ち切る
    private const val MAX_SENTENCE_LENGTH = 256
  }
}

package expo.modules.gnssreceiver

import android.util.Base64
import java.io.BufferedInputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException

data class NtripConfig(
  val host: String,
  val port: Int,
  val mountpoint: String,
  val username: String,
  val password: String,
  /** "v1"（HTTP/1.0＋ICY応答）または"v2"（HTTP/1.1、chunked転送あり） */
  val version: String,
  /** VRS等、受信機の概略位置（GGA）を送らないと補正を配信しないキャスター向け */
  val sendGga: Boolean,
  val ggaIntervalSec: Int,
)

class NtripException(message: String) : IOException(message)

private const val USER_AGENT = "NTRIP EcorisMap/1.0"
private const val CONNECT_TIMEOUT_MS = 10_000
// 補正はふつう1秒ごとに届く。これだけ途絶えたら接続が死んだとみなして張り直す
private const val READ_TIMEOUT_MS = 30_000
private const val MAX_HEADER_BYTES = 8192

private fun authorizationHeader(username: String, password: String): String? {
  if (username.isEmpty() && password.isEmpty()) return null
  val token = Base64.encodeToString("$username:$password".toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
  return "Authorization: Basic $token\r\n"
}

private fun buildRequest(config: NtripConfig, path: String): String {
  val sb = StringBuilder()
  if (config.version == "v2") {
    sb.append("GET /$path HTTP/1.1\r\n")
    sb.append("Host: ${config.host}:${config.port}\r\n")
    sb.append("Ntrip-Version: Ntrip/2.0\r\n")
  } else {
    sb.append("GET /$path HTTP/1.0\r\n")
  }
  sb.append("User-Agent: $USER_AGENT\r\n")
  authorizationHeader(config.username, config.password)?.let { sb.append(it) }
  sb.append("Connection: close\r\n\r\n")
  return sb.toString()
}

/** 応答ヘッダ（空行まで）を読む。ICY 200 OK は空行を伴わないこともあるので状態行だけで返す */
private fun readHeader(input: InputStream): List<String> {
  val lines = mutableListOf<String>()
  val line = StringBuilder()
  var total = 0
  while (true) {
    val b = input.read()
    if (b < 0) break
    total++
    if (total > MAX_HEADER_BYTES) throw NtripException("response header too large")
    if (b == '\n'.code) {
      val text = line.toString().trimEnd('\r')
      line.setLength(0)
      if (text.isEmpty()) break
      lines.add(text)
      if (lines.size == 1 && text.startsWith("ICY 200")) {
        // v1キャスターは状態行の直後にRTCMを流し始めるものがある。続く空行があれば読み捨てる
        input.mark(2)
        val n1 = input.read()
        val n2 = input.read()
        if (!(n1 == '\r'.code && n2 == '\n'.code)) input.reset()
        break
      }
    } else {
      line.append(b.toChar())
    }
  }
  if (lines.isEmpty()) throw NtripException("empty response")
  return lines
}

private fun headerValue(lines: List<String>, name: String): String? =
  lines.drop(1).firstNotNullOfOrNull { l ->
    val i = l.indexOf(':')
    if (i > 0 && l.substring(0, i).trim().equals(name, ignoreCase = true)) l.substring(i + 1).trim() else null
  }

/** chunked転送のボディを素のバイト列として読ませる */
private class ChunkedInputStream(private val input: InputStream) : InputStream() {
  private var remaining = 0
  private var finished = false

  private fun readChunkSize(): Int {
    val sb = StringBuilder()
    while (true) {
      val b = input.read()
      if (b < 0) return -1
      if (b == '\n'.code) break
      if (b != '\r'.code) sb.append(b.toChar())
    }
    val sizeText = sb.toString().substringBefore(';').trim()
    if (sizeText.isEmpty()) return readChunkSize() // 前チャンク末尾のCRLF
    return sizeText.toInt(16)
  }

  override fun read(): Int {
    val one = ByteArray(1)
    return if (read(one, 0, 1) <= 0) -1 else one[0].toInt() and 0xff
  }

  override fun read(b: ByteArray, off: Int, len: Int): Int {
    if (finished) return -1
    if (remaining == 0) {
      val size = readChunkSize()
      if (size <= 0) {
        finished = true
        return -1
      }
      remaining = size
    }
    val n = input.read(b, off, minOf(len, remaining))
    if (n > 0) remaining -= n
    return n
  }
}

private fun openStream(config: NtripConfig, path: String): Triple<Socket, InputStream, List<String>> {
  val socket = Socket()
  try {
    socket.connect(InetSocketAddress(config.host, config.port), CONNECT_TIMEOUT_MS)
    socket.soTimeout = READ_TIMEOUT_MS
    socket.getOutputStream().apply {
      write(buildRequest(config, path).toByteArray(Charsets.ISO_8859_1))
      flush()
    }
    val raw = BufferedInputStream(socket.getInputStream())
    val header = readHeader(raw)
    val body = if (headerValue(header, "Transfer-Encoding")?.contains("chunked", ignoreCase = true) == true) {
      ChunkedInputStream(raw)
    } else {
      raw
    }
    return Triple(socket, body, header)
  } catch (e: Exception) {
    runCatching { socket.close() }
    throw e
  }
}

/** キャスターのソーステーブル（マウントポイント一覧）を本文のテキストのまま取得する */
fun fetchSourceTable(config: NtripConfig): String {
  val (socket, body, header) = openStream(config, "")
  socket.use {
    val status = header[0]
    if (!status.startsWith("SOURCETABLE 200") && !status.contains(" 200")) {
      throw NtripException(status)
    }
    val text = StringBuilder()
    val buf = ByteArray(4096)
    while (true) {
      val n = try {
        body.read(buf)
      } catch (_: SocketTimeoutException) {
        break
      }
      if (n < 0) break
      text.append(String(buf, 0, n, Charsets.ISO_8859_1))
      if (text.contains("ENDSOURCETABLE")) break
    }
    return text.toString()
  }
}

interface NtripListener {
  fun onNtripState(state: String, message: String?)
  fun onCorrection(bytes: ByteArray, length: Int)
  /** キャスターへ送るGGA文（改行なし）。まだ測位できていなければnull */
  fun latestGga(): String?
}

/**
 * キャスターへ接続し続け、受け取った補正を listener.onCorrection へ流す。
 * 切断されたら間隔を延ばしながら張り直す。stop() で終了する。
 */
class NtripClient(private val config: NtripConfig, private val listener: NtripListener) {
  @Volatile private var running = true
  @Volatile private var socket: Socket? = null
  private val thread = Thread({ runLoop() }, "NtripClient")

  fun start() = thread.start()

  fun stop() {
    running = false
    runCatching { socket?.close() }
    thread.interrupt()
  }

  private fun runLoop() {
    var backoffMs = 2_000L
    while (running) {
      try {
        listener.onNtripState("connecting", null)
        val (s, body, header) = openStream(config, config.mountpoint)
        socket = s
        val status = header[0]
        when {
          status.startsWith("ICY 200") || (status.startsWith("HTTP/") && status.contains(" 200")) -> {
            if (headerValue(header, "Content-Type")?.contains("sourcetable", ignoreCase = true) == true) {
              throw NtripException("mountpoint not found")
            }
          }
          status.startsWith("SOURCETABLE") -> throw NtripException("mountpoint not found")
          status.contains(" 401") -> throw NtripException("unauthorized")
          else -> throw NtripException(status)
        }
        listener.onNtripState("connected", null)
        backoffMs = 2_000L
        stream(s, body)
      } catch (e: Exception) {
        if (!running) break
        listener.onNtripState("error", e.message ?: e.javaClass.simpleName)
        // 認証やマウントポイントの誤りは再試行しても直らないので、少し長めに待つ
        val wait = if (e is NtripException && e.message == "unauthorized") 60_000L else backoffMs
        try {
          Thread.sleep(wait)
        } catch (_: InterruptedException) {
          break
        }
        backoffMs = minOf(backoffMs * 2, 60_000L)
      } finally {
        runCatching { socket?.close() }
        socket = null
      }
    }
    listener.onNtripState("off", null)
  }

  private fun stream(s: Socket, body: InputStream) {
    val out: OutputStream = s.getOutputStream()
    val buf = ByteArray(4096)
    val ggaIntervalMs = config.ggaIntervalSec.coerceAtLeast(1) * 1000L
    var lastGgaAt = 0L
    // VRSは最初のGGAを受け取るまで何も送ってこないので、読み取りを短い間隔で区切ってGGA送信の機会を作る
    s.soTimeout = 1000
    var lastDataAt = System.currentTimeMillis()
    while (running) {
      val now = System.currentTimeMillis()
      if (config.sendGga && now - lastGgaAt >= ggaIntervalMs) {
        val gga = listener.latestGga()
        if (gga != null) {
          out.write("$gga\r\n".toByteArray(Charsets.ISO_8859_1))
          out.flush()
          lastGgaAt = now
        }
      }
      val n = try {
        body.read(buf)
      } catch (_: SocketTimeoutException) {
        if (System.currentTimeMillis() - lastDataAt > READ_TIMEOUT_MS) throw NtripException("no data")
        continue
      }
      if (n < 0) throw NtripException("connection closed")
      if (n > 0) {
        lastDataAt = System.currentTimeMillis()
        listener.onCorrection(buf, n)
      }
    }
  }
}

package expo.modules.gnssreceiver

import android.os.Handler
import android.os.HandlerThread
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/**
 * 受信機の出力と、NTRIPで受け取った補正を、加工せずにファイルへ書き出す（後処理（PPK）用）。
 *
 * - 受信機の出力は `<base>.raw` に書き、停止時にUBXの同期バイト（B5 62）を見ていれば `<base>.ubx` に改名する。
 * - 補正は最初に届いたときに `<base>.rtcm3` を作る。
 * - 書き込みは呼び出し元のスレッドでバッファに足すだけにし、ディスクへは専用スレッドで1秒ごとに書き出す。
 *   プロセスが落ちても、失うのは最後の1秒程度。
 * - 書けなくなったら（空き容量不足など）記録を止め、[onError] で知らせる。
 */
class RawLogger(
  private val dir: File,
  val baseName: String,
  private val logCorrections: Boolean,
  private val onError: (String) -> Unit,
  private val onFlushed: () -> Unit,
) {
  val startedAt: Long = System.currentTimeMillis()
  private val lock = Any()
  private val roverFile = File(dir, "$baseName.raw")
  private val correctionFile = File(dir, "$baseName.rtcm3")
  private var rover: BufferedOutputStream? = null
  private var correction: BufferedOutputStream? = null
  private var closed = false
  private var prevByte = -1

  @Volatile var roverBytes = 0L
    private set
  @Volatile var correctionBytes = 0L
    private set
  @Volatile var sawUbx = false
    private set

  private val flushThread = HandlerThread("GnssRawLogFlush").apply { start() }
  private val flushHandler = Handler(flushThread.looper)
  private val flushTask = object : Runnable {
    override fun run() {
      if (flush()) {
        onFlushed()
        flushHandler.postDelayed(this, FLUSH_INTERVAL_MS)
      }
    }
  }

  init {
    if (!dir.exists() && !dir.mkdirs()) {
      flushThread.quitSafely()
      throw IOException("Could not create the folder for raw logs")
    }
    rover = BufferedOutputStream(FileOutputStream(roverFile), BUFFER_SIZE)
    flushHandler.postDelayed(flushTask, FLUSH_INTERVAL_MS)
  }

  fun writeRover(bytes: ByteArray, length: Int = bytes.size) {
    synchronized(lock) {
      val out = rover ?: return
      if (!sawUbx) {
        for (i in 0 until length) {
          val b = bytes[i].toInt() and 0xff
          if (prevByte == 0xB5 && b == 0x62) {
            sawUbx = true
            break
          }
          prevByte = b
        }
      }
      try {
        out.write(bytes, 0, length)
        roverBytes += length
      } catch (e: IOException) {
        failLocked(e)
      }
    }
  }

  fun writeCorrection(bytes: ByteArray, length: Int = bytes.size) {
    if (!logCorrections) return
    synchronized(lock) {
      if (closed) return
      try {
        val out = correction ?: BufferedOutputStream(FileOutputStream(correctionFile), BUFFER_SIZE).also { correction = it }
        out.write(bytes, 0, length)
        correctionBytes += length
      } catch (e: IOException) {
        failLocked(e)
      }
    }
  }

  /** ディスクへ書き出す。続けてよければ true */
  private fun flush(): Boolean = synchronized(lock) {
    if (closed) return false
    try {
      rover?.flush()
      correction?.flush()
      true
    } catch (e: IOException) {
      failLocked(e)
      false
    }
  }

  private fun failLocked(e: IOException) {
    if (closed) return
    closeLocked()
    val message = e.message ?: "Could not write the raw log"
    // onError はセッションの状態を書き換えるので、ロックの外（専用スレッド）で呼ぶ
    flushHandler.post { onError(message) }
  }

  private fun closeLocked() {
    closed = true
    runCatching { rover?.close() }
    runCatching { correction?.close() }
    rover = null
    correction = null
  }

  /** 記録を閉じて、残ったファイルの情報を返す */
  fun stop(): Map<String, Any?> {
    synchronized(lock) { closeLocked() }
    flushHandler.removeCallbacksAndMessages(null)
    flushThread.quitSafely()
    var roverPath = roverFile
    if (sawUbx) {
      val renamed = File(dir, "$baseName.ubx")
      if (roverFile.renameTo(renamed)) roverPath = renamed
    }
    return mapOf(
      "baseName" to baseName,
      "roverPath" to roverPath.absolutePath,
      "correctionPath" to (if (correctionFile.exists()) correctionFile.absolutePath else null),
      "roverBytes" to roverBytes.toDouble(),
      "correctionBytes" to correctionBytes.toDouble(),
      "sawUbx" to sawUbx,
      "startedAt" to startedAt.toDouble(),
      "endedAt" to System.currentTimeMillis().toDouble(),
    )
  }

  companion object {
    private const val FLUSH_INTERVAL_MS = 1000L
    private const val BUFFER_SIZE = 64 * 1024
  }
}

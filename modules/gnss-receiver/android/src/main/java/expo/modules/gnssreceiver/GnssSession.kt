package expo.modules.gnssreceiver

import android.os.Handler
import android.os.HandlerThread

interface GnssSessionListener {
  fun onSentences(sentences: List<String>, receivedAt: Long)
  fun onStatus(status: Map<String, Any?>)
}

/**
 * 受信機リンクとNTRIPクライアントを束ねる。プロセスに1つだけ置く。
 *
 * 補正の中継（キャスター→受信機）とGGAの返送（受信機→キャスター）はここで完結させ、
 * JSには位置の解釈に要るNMEA文だけを間引いて渡す。
 */
object GnssSession {
  @Volatile var listener: GnssSessionListener? = null

  private val lock = Any()
  private var link: GnssLink? = null
  private var linkState = "disconnected"
  private var linkError: String? = null
  private var ntrip: NtripClient? = null
  private var ntripState = "off"
  private var ntripError: String? = null
  @Volatile private var rtcmBytes = 0L
  @Volatile private var lastCorrectionAt = 0L
  @Volatile private var lastGga: String? = null

  private val pending = mutableListOf<String>()
  private val flushThread = HandlerThread("GnssSessionFlush").apply { start() }
  private val flushHandler = Handler(flushThread.looper)
  private var flushScheduled = false

  private val assembler = NmeaLineAssembler { sentence -> onSentence(sentence) }

  fun status(): Map<String, Any?> = synchronized(lock) {
    mapOf(
      "link" to linkState,
      "linkName" to link?.name,
      "linkError" to linkError,
      "ntrip" to ntripState,
      "ntripError" to ntripError,
      "rtcmBytes" to rtcmBytes.toDouble(),
      "lastCorrectionAt" to lastCorrectionAt.toDouble(),
    )
  }

  private fun emitStatus() {
    listener?.onStatus(status())
  }

  fun attachLink(factory: (onData: (ByteArray) -> Unit, onError: (Exception) -> Unit) -> GnssLink) {
    detachLink()
    synchronized(lock) {
      linkState = "connecting"
      linkError = null
    }
    emitStatus()
    var created: GnssLink? = null
    try {
      created = factory(
        { data -> synchronized(assembler) { assembler.feed(data) } },
        { e -> onLinkError(created, e) },
      )
      synchronized(lock) {
        link = created
        linkState = "connected"
      }
    } catch (e: Exception) {
      synchronized(lock) {
        linkState = "disconnected"
        linkError = e.message ?: e.javaClass.simpleName
      }
      emitStatus()
      throw e
    }
    emitStatus()
  }

  private fun onLinkError(source: GnssLink?, e: Exception) {
    synchronized(lock) {
      // 自分で閉じたリンクの読み取りエラーや、差し替え前の古いリンクからの通知は無視する
      if (source == null || source !== link) return
      runCatching { source.close() }
      link = null
      linkState = "disconnected"
      linkError = e.message ?: e.javaClass.simpleName
      lastGga = null
    }
    emitStatus()
  }

  fun detachLink() {
    val old = synchronized(lock) {
      val l = link
      link = null
      linkState = "disconnected"
      linkError = null
      lastGga = null
      l
    }
    if (old != null) {
      runCatching { old.close() }
      emitStatus()
    }
  }

  fun startNtrip(config: NtripConfig) {
    stopNtrip()
    synchronized(lock) {
      rtcmBytes = 0L
      lastCorrectionAt = 0L
      ntripError = null
    }
    val client = NtripClient(config, object : NtripListener {
      override fun onNtripState(state: String, message: String?) {
        synchronized(lock) {
          if (ntrip == null && state != "off") return
          ntripState = state
          if (state == "error") ntripError = message else if (state == "connected") ntripError = null
        }
        emitStatus()
      }

      override fun onCorrection(bytes: ByteArray, length: Int) {
        rtcmBytes += length
        lastCorrectionAt = System.currentTimeMillis()
        val target = synchronized(lock) { link }
        try {
          target?.write(bytes, length)
        } catch (e: Exception) {
          onLinkError(target, e)
        }
      }

      override fun latestGga(): String? = lastGga
    })
    synchronized(lock) { ntrip = client }
    client.start()
  }

  fun stopNtrip() {
    val old = synchronized(lock) {
      val c = ntrip
      ntrip = null
      ntripState = "off"
      c
    }
    old?.stop()
    emitStatus()
  }

  private fun onSentence(sentence: String) {
    // "$GNGGA,..." の文種（トーカーを除く3文字）だけを見て、位置の解釈に要るものだけを渡す
    if (sentence.length < 7) return
    val type = sentence.substring(3, 6)
    if (type == "GGA") {
      // 測位できていない（緯度が空の）GGAをVRSに送ると拒否されるので、位置のあるものだけ残す
      val fields = sentence.split(',')
      if (fields.size > 6 && fields[2].isNotEmpty() && fields[6] != "0") lastGga = sentence
    }
    if (type != "GGA" && type != "RMC" && type != "GST") return
    synchronized(pending) {
      pending.add(sentence)
      if (pending.size > MAX_PENDING) pending.subList(0, pending.size - MAX_PENDING).clear()
      if (!flushScheduled) {
        flushScheduled = true
        flushHandler.postDelayed({ flush() }, FLUSH_INTERVAL_MS)
      }
    }
  }

  private fun flush() {
    val batch = synchronized(pending) {
      flushScheduled = false
      val copy = pending.toList()
      pending.clear()
      copy
    }
    if (batch.isNotEmpty()) listener?.onSentences(batch, System.currentTimeMillis())
  }

  // 10Hz出力でもJSへのイベントは秒間数回に抑える
  private const val FLUSH_INTERVAL_MS = 200L
  private const val MAX_PENDING = 200
}

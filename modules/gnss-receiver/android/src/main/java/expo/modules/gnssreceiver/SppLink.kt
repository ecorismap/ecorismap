package expo.modules.gnssreceiver

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

/** Serial Port Profile の標準UUID */
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

/**
 * Bluetoothクラシック（SPP/RFCOMM）でつないだ受信機。ペアリングはAndroidの設定で済ませておく。
 * BLEのNordic UARTを持たない受信機（Drogger、Bluetooth GPSロガー等）のための経路。
 */
@SuppressLint("MissingPermission")
class SppLink(
  adapter: BluetoothAdapter,
  device: BluetoothDevice,
  private val onData: (ByteArray) -> Unit,
  private val onError: (Exception) -> Unit,
) : GnssLink {
  override val name: String = device.name?.takeIf { it.isNotBlank() } ?: device.address
  private val socket: BluetoothSocket
  private val input: InputStream
  private val output: OutputStream
  private val writeLock = Any()
  @Volatile private var closed = false
  private val reader: Thread

  init {
    // 検索中はRFCOMMの接続が極端に遅くなる・失敗する
    runCatching { adapter.cancelDiscovery() }
    socket = openSocket(device)
    input = socket.inputStream
    output = socket.outputStream
    reader = Thread({ readLoop() }, "GnssSppReader").apply {
      isDaemon = true
      start()
    }
  }

  private fun readLoop() {
    val buffer = ByteArray(4096)
    try {
      while (!closed) {
        val n = input.read(buffer)
        if (n < 0) throw IOException("Bluetooth connection closed")
        if (n > 0) onData(buffer.copyOf(n))
      }
    } catch (e: Exception) {
      if (!closed) onError(e)
    }
  }

  override fun write(bytes: ByteArray, length: Int) {
    synchronized(writeLock) {
      output.write(bytes, 0, length)
      output.flush()
    }
  }

  override fun close() {
    closed = true
    runCatching { socket.close() }
  }

  companion object {
    /**
     * 標準の接続→暗号化なし→チャンネル1直指定の順に試す。
     * 安価な受信機やBluetoothモジュールには、SDPの応答が不完全で標準の方法では接続できないものがある
     */
    private fun openSocket(device: BluetoothDevice): BluetoothSocket {
      val attempts: List<() -> BluetoothSocket> = listOf(
        { device.createRfcommSocketToServiceRecord(SPP_UUID) },
        { device.createInsecureRfcommSocketToServiceRecord(SPP_UUID) },
        {
          // 非公開API。上の2つがだめな機器のための最後の手段
          device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType).invoke(device, 1)
            as BluetoothSocket
        },
      )
      var lastError: Exception? = null
      for (create in attempts) {
        val socket = try {
          create()
        } catch (e: Exception) {
          lastError = e
          continue
        }
        try {
          socket.connect()
          return socket
        } catch (e: Exception) {
          lastError = e
          runCatching { socket.close() }
        }
      }
      throw IOException(lastError?.message ?: "Bluetooth connection failed", lastError)
    }
  }
}

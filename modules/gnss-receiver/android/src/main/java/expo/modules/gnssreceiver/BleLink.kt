package expo.modules.gnssreceiver

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

/** Nordic UART Service。BLE対応のGNSS受信機の多くがシリアルの代わりにこれを出す */
val NUS_SERVICE: UUID = UUID.fromString("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
private val NUS_RX: UUID = UUID.fromString("6E400002-B5A3-F393-E0A9-E50E24DCCA9E") // 受信機へ書く
private val NUS_TX: UUID = UUID.fromString("6E400003-B5A3-F393-E0A9-E50E24DCCA9E") // 受信機から通知
private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

private const val CONNECT_TIMEOUT_SEC = 20L
private const val WRITE_TIMEOUT_MS = 1000L
private const val REQUESTED_MTU = 247

/**
 * BLE（NUS）で受信機とつなぐ。生成時に接続・サービス探索・通知の有効化まで済ませる（呼び出し側のスレッドで待つ）。
 * 権限（BLUETOOTH_CONNECT）はJS側で取得済みであること。
 */
@SuppressLint("MissingPermission")
class BleLink(
  context: Context,
  device: BluetoothDevice,
  private val onData: (ByteArray) -> Unit,
  private val onError: (Exception) -> Unit,
) : GnssLink {
  override val name: String = device.name ?: device.address
  private val ready = CountDownLatch(1)
  @Volatile private var setupError: String? = null
  @Volatile private var closed = false
  @Volatile private var rx: BluetoothGattCharacteristic? = null
  @Volatile private var payloadSize = 20 // MTU 23 − ATTヘッダ3
  // Androidは書き込みを1件ずつしか受け付けないので、完了通知を待ってから次を書く
  private val writeSlot = Semaphore(1)
  private val gatt: BluetoothGatt

  private val callback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
        g.requestMtu(REQUESTED_MTU)
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        if (ready.count > 0) {
          setupError = "BLE connection failed ($status)"
          ready.countDown()
        } else if (!closed) {
          onError(IllegalStateException("BLE disconnected"))
        }
      }
    }

    override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) payloadSize = mtu - 3
      g.discoverServices()
    }

    override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
      val service = g.getService(NUS_SERVICE)
      val tx = service?.getCharacteristic(NUS_TX)
      rx = service?.getCharacteristic(NUS_RX)
      if (tx == null || rx == null) {
        setupError = "Nordic UART service not found"
        ready.countDown()
        return
      }
      g.setCharacteristicNotification(tx, true)
      val descriptor = tx.getDescriptor(CCCD)
      if (descriptor == null) {
        ready.countDown()
        return
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        g.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
      } else {
        @Suppress("DEPRECATION")
        descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        @Suppress("DEPRECATION")
        g.writeDescriptor(descriptor)
      }
    }

    override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      if (status != BluetoothGatt.GATT_SUCCESS) setupError = "Could not enable notifications ($status)"
      ready.countDown()
    }

    override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
      if (characteristic.uuid == NUS_TX) onData(value)
    }

    @Deprecated("Android 12以前で呼ばれる")
    override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      @Suppress("DEPRECATION")
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && characteristic.uuid == NUS_TX) onData(characteristic.value)
    }

    override fun onCharacteristicWrite(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      writeSlot.release()
    }
  }

  init {
    gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    if (!ready.await(CONNECT_TIMEOUT_SEC, TimeUnit.SECONDS)) setupError = "BLE connection timed out"
    setupError?.let {
      close()
      throw IllegalStateException(it)
    }
  }

  override fun write(bytes: ByteArray, length: Int) {
    val target = rx ?: return
    var offset = 0
    while (offset < length && !closed) {
      val end = minOf(offset + payloadSize, length)
      val chunk = bytes.copyOfRange(offset, end)
      if (!writeSlot.tryAcquire(WRITE_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
        // 完了通知が来ないまま詰まった場合に永久に止まらないよう、枠を戻して続ける
        writeSlot.release()
        writeSlot.acquire()
      }
      val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        gatt.writeCharacteristic(target, chunk, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) ==
          BluetoothGatt.GATT_SUCCESS
      } else {
        @Suppress("DEPRECATION")
        target.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        @Suppress("DEPRECATION")
        target.value = chunk
        @Suppress("DEPRECATION")
        gatt.writeCharacteristic(target)
      }
      if (!started) writeSlot.release()
      offset = end
    }
  }

  override fun close() {
    closed = true
    runCatching { gatt.disconnect() }
    runCatching { gatt.close() }
  }
}

package expo.modules.gnssreceiver

import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import com.hoho.android.usbserial.driver.CdcAcmSerialDriver
import com.hoho.android.usbserial.driver.ProbeTable
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.hoho.android.usbserial.util.SerialInputOutputManager

/** 受信機との双方向リンク。USB以外（BLE等）も同じ形で差し込めるようにしておく */
interface GnssLink {
  val name: String
  fun write(bytes: ByteArray, length: Int)
  fun close()
}

private const val UBLOX_VENDOR_ID = 0x1546

/** 既定のプローバに加えて、u-bloxの受信機（ZED-F9P等のネイティブUSB）をCDC-ACMとして認識させる */
private val prober: UsbSerialProber by lazy {
  val table = UsbSerialProber.getDefaultProbeTable()
  for (productId in listOf(0x01a7, 0x01a8, 0x01a9)) {
    table.addProduct(UBLOX_VENDOR_ID, productId, CdcAcmSerialDriver::class.java)
  }
  UsbSerialProber(table)
}

fun findUsbDrivers(manager: UsbManager): List<UsbSerialDriver> = prober.findAllDrivers(manager)

fun usbDeviceLabel(device: UsbDevice): String {
  val product = device.productName?.trim().orEmpty()
  val maker = device.manufacturerName?.trim().orEmpty()
  return listOf(maker, product).filter { it.isNotEmpty() }.joinToString(" ").ifEmpty {
    String.format("USB %04X:%04X", device.vendorId, device.productId)
  }
}

class UsbLink(
  manager: UsbManager,
  driver: UsbSerialDriver,
  baudRate: Int,
  private val onData: (ByteArray) -> Unit,
  private val onError: (Exception) -> Unit,
) : GnssLink {
  override val name: String = usbDeviceLabel(driver.device)
  private val port: UsbSerialPort = driver.ports[0]
  private val ioManager: SerialInputOutputManager

  init {
    val connection = manager.openDevice(driver.device) ?: throw IllegalStateException("USB device could not be opened")
    port.open(connection)
    try {
      port.setParameters(baudRate, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
    } catch (_: UnsupportedOperationException) {
      // CDC-ACMの一部はボーレート設定を受け付けない（USB直結では速度が意味を持たない）
    }
    // CDC-ACMはDTRを立てないと送信しない機器がある
    runCatching { port.dtr = true }
    ioManager = SerialInputOutputManager(port, object : SerialInputOutputManager.Listener {
      override fun onNewData(data: ByteArray) = onData(data)
      override fun onRunError(e: Exception) = onError(e)
    })
    ioManager.start()
  }

  override fun write(bytes: ByteArray, length: Int) {
    val chunk = if (length == bytes.size) bytes else bytes.copyOf(length)
    port.write(chunk, WRITE_TIMEOUT_MS)
  }

  override fun close() {
    runCatching { ioManager.stop() }
    runCatching { port.close() }
  }

  companion object {
    private const val WRITE_TIMEOUT_MS = 1000
  }
}

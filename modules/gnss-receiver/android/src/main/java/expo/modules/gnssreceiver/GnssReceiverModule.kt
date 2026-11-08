package expo.modules.gnssreceiver

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class NtripConfigRecord : Record {
  @Field val host: String = ""
  @Field val port: Int = 2101
  @Field val mountpoint: String = ""
  @Field val username: String = ""
  @Field val password: String = ""
  @Field val version: String = "v1"
  @Field val sendGga: Boolean = true
  @Field val ggaIntervalSec: Int = 10

  fun toConfig() = NtripConfig(host.trim(), port, mountpoint.trim(), username, password, version, sendGga, ggaIntervalSec)
}

private class GnssReceiverException(message: String) : CodedException(message)

private const val ACTION_USB_PERMISSION = "expo.modules.gnssreceiver.USB_PERMISSION"
private const val BLE_SCAN_DURATION_MS = 15_000L

/**
 * 外部GNSS受信機（USBシリアル）との接続と、NTRIPキャスターからの補正の中継。
 * 受信機の出すNMEA文は onNmea イベント、接続状態は onStatus イベントでJSへ渡す。
 */
class GnssReceiverModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw GnssReceiverException("React context is not available")

  private val usbManager: UsbManager
    get() = context.getSystemService(Context.USB_SERVICE) as UsbManager

  override fun definition() = ModuleDefinition {
    Name("GnssReceiver")

    Events("onNmea", "onStatus", "onBleDevice", "onUsbAttached")

    // 受信機のUSBを挿したことを知らせる（前回の受信機への自動再接続に使う）
    // NMEA・状態の中継はモジュールの寿命で張る（iOSと同じ）。
    // 名前なしのOnStopObservingはどのイベントの購読が0件になっても呼ばれるため、
    // 設定画面を閉じてonBleDeviceの購読が外れただけでNMEAの中継まで止まっていた
    OnCreate {
      registerUsbAttachReceiver()
      GnssSession.listener = object : GnssSessionListener {
        override fun onSentences(sentences: List<String>, receivedAt: Long) {
          sendEvent("onNmea", mapOf("sentences" to sentences, "receivedAt" to receivedAt.toDouble()))
        }

        override fun onStatus(status: Map<String, Any?>) {
          sendEvent("onStatus", status)
        }
      }
    }

    OnDestroy {
      GnssSession.listener = null
      stopBleScan()
      unregisterUsbAttachReceiver()
    }

    Function("getStatus") { GnssSession.status() }

    Function("listUsbDevices") {
      findUsbDrivers(usbManager).map { driver ->
        val device = driver.device
        mapOf(
          "deviceId" to device.deviceId,
          "name" to usbDeviceLabel(device),
          "vendorId" to device.vendorId,
          "productId" to device.productId,
          "hasPermission" to usbManager.hasPermission(device),
        )
      }
    }

    AsyncFunction("connectUsb") { deviceId: Int, baudRate: Int, promise: Promise ->
      val manager = usbManager
      val driver = findUsbDrivers(manager).firstOrNull { it.device.deviceId == deviceId }
      if (driver == null) {
        promise.reject(GnssReceiverException("USB device not found"))
        return@AsyncFunction
      }
      val open = {
        try {
          GnssSession.attachLink { onData, onError -> UsbLink(manager, driver, baudRate, onData, onError) }
          promise.resolve(GnssSession.status())
        } catch (e: Exception) {
          promise.reject(GnssReceiverException(e.message ?: "USB open failed"))
        }
      }
      if (manager.hasPermission(driver.device)) {
        open()
      } else {
        requestUsbPermission(manager, driver.device) { granted ->
          if (granted) open() else promise.reject(GnssReceiverException("USB permission denied"))
        }
      }
    }

    Function("startBleScan") {
      startBleScan()
    }

    Function("stopBleScan") {
      stopBleScan()
    }

    // 接続完了まで待つ（最大20秒）ので、モジュールのキューで実行させる
    AsyncFunction("connectBle") { address: String ->
      stopBleScan()
      val adapter = bluetoothManager.adapter ?: throw GnssReceiverException("Bluetooth is not available")
      if (!adapter.isEnabled) throw GnssReceiverException("Bluetooth is turned off")
      val device = adapter.getRemoteDevice(address)
      val ctx = context
      try {
        GnssSession.attachLink { onData, onError -> BleLink(ctx, device, onData, onError) }
      } catch (e: Exception) {
        throw GnssReceiverException(e.message ?: "BLE connection failed")
      }
      GnssSession.status()
    }

    AsyncFunction("disconnect") {
      GnssSession.detachLink()
    }

    AsyncFunction("startNtrip") { config: NtripConfigRecord ->
      val c = config.toConfig()
      if (c.host.isEmpty() || c.mountpoint.isEmpty()) throw GnssReceiverException("host and mountpoint are required")
      GnssSession.startNtrip(c)
    }

    AsyncFunction("stopNtrip") {
      GnssSession.stopNtrip()
    }

    // ネットワークI/Oを伴うのでモジュールのキュー（JSスレッド外）で実行される
    AsyncFunction("getSourceTable") { config: NtripConfigRecord ->
      fetchSourceTable(config.toConfig().copy(mountpoint = ""))
    }
  }

  private val bluetoothManager: BluetoothManager
    get() = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager

  private var scanCallback: ScanCallback? = null
  private val scanStopHandler = Handler(Looper.getMainLooper())

  /** 名前のある機器を onBleDevice で知らせる。権限（BLUETOOTH_SCAN）はJS側で取得済みであること */
  @SuppressLint("MissingPermission")
  private fun startBleScan() {
    stopBleScan()
    val scanner = bluetoothManager.adapter?.takeIf { it.isEnabled }?.bluetoothLeScanner
      ?: throw GnssReceiverException("Bluetooth is turned off")
    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val name = result.scanRecord?.deviceName ?: result.device.name ?: return
        val hasNus = result.scanRecord?.serviceUuids?.any { it.uuid == NUS_SERVICE } == true
        sendEvent(
          "onBleDevice",
          mapOf("address" to result.device.address, "name" to name, "rssi" to result.rssi, "hasNus" to hasNus),
        )
      }
    }
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
    scanner.startScan(null, settings, callback)
    scanCallback = callback
    // 付けっぱなしは電池を食うので一定時間で止める
    scanStopHandler.postDelayed({ stopBleScan() }, BLE_SCAN_DURATION_MS)
  }

  @SuppressLint("MissingPermission")
  private fun stopBleScan() {
    scanStopHandler.removeCallbacksAndMessages(null)
    val callback = scanCallback ?: return
    scanCallback = null
    runCatching { bluetoothManager.adapter?.bluetoothLeScanner?.stopScan(callback) }
  }

  private var usbAttachReceiver: BroadcastReceiver? = null

  private fun registerUsbAttachReceiver() {
    val ctx = appContext.reactContext ?: return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        if (intent.action != UsbManager.ACTION_USB_DEVICE_ATTACHED) return
        @Suppress("DEPRECATION")
        val device = intent.getParcelableExtra<android.hardware.usb.UsbDevice>(UsbManager.EXTRA_DEVICE) ?: return
        sendEvent(
          "onUsbAttached",
          mapOf("deviceId" to device.deviceId, "vendorId" to device.vendorId, "productId" to device.productId),
        )
      }
    }
    val filter = IntentFilter(UsbManager.ACTION_USB_DEVICE_ATTACHED)
    // システムが送るブロードキャストを受けるので公開する（偽の通知が来ても接続を試みるだけ）
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      ctx.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      ctx.registerReceiver(receiver, filter)
    }
    usbAttachReceiver = receiver
  }

  private fun unregisterUsbAttachReceiver() {
    val receiver = usbAttachReceiver ?: return
    usbAttachReceiver = null
    runCatching { appContext.reactContext?.unregisterReceiver(receiver) }
  }

  private fun requestUsbPermission(manager: UsbManager, device: android.hardware.usb.UsbDevice, onResult: (Boolean) -> Unit) {
    val ctx = context
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        if (intent.action != ACTION_USB_PERMISSION) return
        runCatching { ctx.unregisterReceiver(this) }
        onResult(intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false) || manager.hasPermission(device))
      }
    }
    val filter = IntentFilter(ACTION_USB_PERMISSION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      ctx.registerReceiver(receiver, filter)
    }
    // 結果はシステムがインテントに書き足して返すのでMUTABLEが必要。Android 14以降は暗黙インテントを
    // MUTABLEにできないため、自アプリ宛てに限定する
    val intent = Intent(ACTION_USB_PERMISSION).setPackage(ctx.packageName)
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    manager.requestPermission(device, PendingIntent.getBroadcast(ctx, 0, intent, flags))
  }
}

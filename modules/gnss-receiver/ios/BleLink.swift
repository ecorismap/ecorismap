import CoreBluetooth
import Foundation

/** Nordic UART Service。BLE対応のGNSS受信機の多くがシリアルの代わりにこれを出す */
let nusService = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
private let nusRx = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E") // 受信機へ書く
private let nusTx = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E") // 受信機から通知

private let connectTimeout: TimeInterval = 20
private let scanDuration: TimeInterval = 15
// 権限ダイアログへの応答を待つ時間
private let authorizationTimeout: TimeInterval = 60
// 書き込みが詰まったときに溜めておく補正の上限。古い補正は役に立たないので捨てる
private let maxPendingWrite = 32 * 1024

/** BLEの権限の状態（ダイアログは出さない）。"allowed" / "denied" / "notDetermined" */
func bleAuthorization() -> String {
  switch CBManager.authorization {
  case .allowedAlways: return "allowed"
  case .notDetermined: return "notDetermined"
  default: return "denied"
  }
}

/**
 CBCentralManagerを1つだけ持ち、スキャンと接続中のリンクへのイベントの振り分けを行う。
 CoreBluetoothのコールバックはすべて queue で受ける。
 */
final class BleCentral: NSObject, CBCentralManagerDelegate {
  static let shared = BleCentral()

  let queue = DispatchQueue(label: "GnssReceiver.ble")
  /** 名前のある機器を見つけたとき（queue上で呼ばれる） */
  var onDiscover: (([String: Any]) -> Void)?

  private var manager: CBCentralManager?
  private var stateWaiters: [(CBManagerState) -> Void] = []
  private var scanGeneration = 0
  private var link: BleLink?

  /**
   poweredOnのmanagerを返す。managerは最初に要るときに作る（作った時点で権限ダイアログが出るため、
   アプリの起動時ではなくスキャン・接続のときにする）。queue上から呼ばないこと。
   */
  func readyManager() throws -> CBCentralManager {
    let ready = DispatchSemaphore(value: 0)
    let resultLock = NSLock()
    var result: CBManagerState = .unknown
    let mgr: CBCentralManager = queue.sync {
      let m = manager ?? CBCentralManager(
        delegate: self, queue: queue, options: [CBCentralManagerOptionShowPowerAlertKey: false])
      manager = m
      if m.state != .unknown && m.state != .resetting {
        result = m.state
        ready.signal()
      } else {
        stateWaiters.append { state in
          resultLock.lock()
          result = state
          resultLock.unlock()
          ready.signal()
        }
      }
      return m
    }
    if ready.wait(timeout: .now() + authorizationTimeout) == .timedOut { throw GnssError("Bluetooth is not ready") }
    resultLock.lock()
    let state = result
    resultLock.unlock()
    switch state {
    case .poweredOn: return mgr
    case .unauthorized: throw GnssError("Bluetooth permission denied")
    case .unsupported: throw GnssError("Bluetooth is not available")
    default: throw GnssError("Bluetooth is turned off")
    }
  }

  func startScan() throws {
    let mgr = try readyManager()
    queue.sync {
      mgr.stopScan()
      mgr.scanForPeripherals(withServices: nil, options: nil)
      // 付けっぱなしは電池を食うので一定時間で止める
      scanGeneration += 1
      let generation = scanGeneration
      queue.asyncAfter(deadline: .now() + scanDuration) { [weak self] in
        guard let self, self.scanGeneration == generation else { return }
        self.manager?.stopScan()
      }
    }
  }

  func stopScan() {
    queue.async { [self] in
      scanGeneration += 1
      if manager?.state == .poweredOn { manager?.stopScan() }
    }
  }

  /** queue上で呼ぶ */
  func attach(_ link: BleLink) { self.link = link }

  /** queue上で呼ぶ */
  func detach(_ link: BleLink) {
    if self.link === link { self.link = nil }
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    let state = central.state
    if state == .unknown || state == .resetting { return }
    let waiters = stateWaiters
    stateWaiters.removeAll()
    waiters.forEach { $0(state) }
    // Bluetoothを切ると、接続中の機器の切断は通知されないまま無効になる
    if state != .poweredOn { link?.handleDisconnect(message: "Bluetooth is turned off") }
  }

  func centralManager(
    _ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any], rssi RSSI: NSNumber
  ) {
    let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name
    guard let name, !name.isEmpty else { return }
    let services = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
    // iOSはMACアドレスを出さない。identifierはアプリごとに一定なので、自動再接続にもこれを使う
    onDiscover?([
      "address": peripheral.identifier.uuidString,
      "name": name,
      "rssi": RSSI.intValue,
      "hasNus": services.contains(nusService),
    ])
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    guard let link, link.peripheral === peripheral else { return }
    link.handleConnected()
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    guard let link, link.peripheral === peripheral else { return }
    link.handleDisconnect(message: "BLE connection failed (\(error?.localizedDescription ?? "unknown"))")
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    guard let link, link.peripheral === peripheral else { return }
    link.handleDisconnect(message: "BLE disconnected")
  }
}

/**
 BLE（NUS）で受信機とつなぐ。生成時に接続・サービス探索・通知の有効化まで済ませる（呼び出し側のスレッドで待つ）。
 */
final class BleLink: NSObject, GnssLink, CBPeripheralDelegate {
  let peripheral: CBPeripheral
  private let address: String
  private let central: CBCentralManager
  private let queue: DispatchQueue
  private let onData: (Data) -> Void
  private let onError: (String) -> Void

  // 以下はqueue上でのみ触る
  private let ready = DispatchSemaphore(value: 0)
  private var isReady = false
  private var setupError: String?
  private var closed = false
  private var rx: CBCharacteristic?
  private var writeType: CBCharacteristicWriteType = .withoutResponse
  private var pending = Data()
  private var awaitingWriteResponse = false

  var name: String { peripheral.name ?? address }

  init(address: String, onData: @escaping (Data) -> Void, onError: @escaping (String) -> Void) throws {
    let ble = BleCentral.shared
    let mgr = try ble.readyManager()
    guard let identifier = UUID(uuidString: address) else { throw GnssError("BLE device not found") }
    guard let found = ble.queue.sync(execute: { mgr.retrievePeripherals(withIdentifiers: [identifier]).first }) else {
      throw GnssError("BLE device not found")
    }
    self.peripheral = found
    self.address = address
    self.central = mgr
    self.queue = ble.queue
    self.onData = onData
    self.onError = onError
    super.init()

    queue.sync {
      ble.attach(self)
      peripheral.delegate = self
      mgr.stopScan()
      mgr.connect(peripheral, options: nil)
    }
    // iOSの接続要求は時間切れにならないので、自分で打ち切る
    let timedOut = ready.wait(timeout: .now() + connectTimeout) == .timedOut
    let error: String? = queue.sync {
      if timedOut && setupError == nil { setupError = "BLE connection timed out" }
      return setupError
    }
    if let error {
      close()
      throw GnssError(error)
    }
  }

  private func finishSetup(error: String?) {
    if isReady { return }
    isReady = true
    setupError = error
    ready.signal()
  }

  /** queue上で呼ばれる */
  func handleConnected() {
    peripheral.discoverServices([nusService])
  }

  /** queue上で呼ばれる */
  func handleDisconnect(message: String) {
    if !isReady {
      finishSetup(error: message)
    } else if !closed {
      closed = true
      onError(message)
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let service = peripheral.services?.first(where: { $0.uuid == nusService }) else {
      finishSetup(error: "Nordic UART service not found")
      return
    }
    peripheral.discoverCharacteristics([nusRx, nusTx], for: service)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    let tx = service.characteristics?.first(where: { $0.uuid == nusTx })
    let rxChar = service.characteristics?.first(where: { $0.uuid == nusRx })
    guard let tx, let rxChar else {
      finishSetup(error: "Nordic UART service not found")
      return
    }
    rx = rxChar
    // 応答なし書き込みに対応しない受信機もあるので、そのときは応答ありで1件ずつ書く
    writeType = rxChar.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
    peripheral.setNotifyValue(true, for: tx)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    guard characteristic.uuid == nusTx else { return }
    finishSetup(error: error.map { "Could not enable notifications (\($0.localizedDescription))" })
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard characteristic.uuid == nusTx, let value = characteristic.value, !closed else { return }
    onData(value)
  }

  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    awaitingWriteResponse = false
    drain()
  }

  func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
    drain()
  }

  func write(_ data: Data) {
    queue.async { [self] in
      guard !closed, rx != nil else { return }
      pending.append(data)
      if pending.count > maxPendingWrite {
        pending.removeSubrange(pending.startIndex..<pending.startIndex + (pending.count - maxPendingWrite))
      }
      drain()
    }
  }

  /** 送れるだけ送る。応答なし書き込みは送信枠が空くまで、応答ありは応答が来るまで待つ（queue上で呼ぶ） */
  private func drain() {
    guard let rx else { return }
    let chunkSize = max(peripheral.maximumWriteValueLength(for: writeType), 20)
    while !pending.isEmpty && !closed {
      if writeType == .withResponse ? awaitingWriteResponse : !peripheral.canSendWriteWithoutResponse { return }
      let n = min(chunkSize, pending.count)
      let chunk = Data(pending.prefix(n))
      pending.removeSubrange(pending.startIndex..<pending.startIndex + n)
      peripheral.writeValue(chunk, for: rx, type: writeType)
      if writeType == .withResponse { awaitingWriteResponse = true }
    }
  }

  func close() {
    queue.async { [self] in
      closed = true
      pending.removeAll()
      BleCentral.shared.detach(self)
      central.cancelPeripheralConnection(peripheral)
    }
  }
}

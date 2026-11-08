import ExpoModulesCore

struct NtripConfigRecord: Record {
  @Field var host: String = ""
  @Field var port: Int = 2101
  @Field var mountpoint: String = ""
  @Field var username: String = ""
  @Field var password: String = ""
  @Field var version: String = "v1"
  @Field var sendGga: Bool = true
  @Field var ggaIntervalSec: Int = 10

  func toConfig(mountpoint override: String? = nil) -> NtripConfig {
    NtripConfig(
      host: host.trimmingCharacters(in: .whitespaces),
      port: port,
      mountpoint: (override ?? mountpoint).trimmingCharacters(in: .whitespaces),
      username: username,
      password: password,
      version: version,
      sendGga: sendGga,
      ggaIntervalSec: ggaIntervalSec
    )
  }
}

final class GnssReceiverException: GenericException<String>, @unchecked Sendable {
  override var reason: String { param }
}

/**
 外部GNSS受信機（BLE）との接続と、NTRIPキャスターからの補正の中継。
 受信機の出すNMEA文は onNmea イベント、接続状態は onStatus イベントでJSへ渡す。
 iOSはMFi以外のUSB機器を扱えないため、USBの関数は空の結果か失敗を返す。
 */
public class GnssReceiverModule: Module {
  // 接続や権限ダイアログの応答を待って止まる関数がある。既定のキューは全モジュール共有で直列なので、
  // 他のモジュールの非同期関数を巻き込まないよう専用のキューで動かす
  private let workQueue = DispatchQueue(label: "GnssReceiver.work", qos: .userInitiated, attributes: .concurrent)

  public func definition() -> ModuleDefinition {
    Name("GnssReceiver")

    Events("onNmea", "onStatus", "onBleDevice", "onUsbAttached")

    OnCreate {
      GnssSession.shared.setListener(
        onSentences: { [weak self] sentences, receivedAt in
          self?.sendEvent("onNmea", ["sentences": sentences, "receivedAt": receivedAt])
        },
        onStatus: { [weak self] status in self?.sendEvent("onStatus", status) }
      )
      BleCentral.shared.onDiscover = { [weak self] device in self?.sendEvent("onBleDevice", device) }
    }

    OnDestroy {
      BleCentral.shared.stopScan()
      BleCentral.shared.onDiscover = nil
      GnssSession.shared.setListener(onSentences: nil, onStatus: nil)
    }

    Function("getStatus") { GnssSession.shared.status() }

    Function("getBleAuthorization") { bleAuthorization() }

    Function("listUsbDevices") { [[String: Any]]() }

    AsyncFunction("connectUsb") { (_: Int, _: Int) throws -> [String: Any] in
      throw GnssReceiverException("USB is not supported on iOS")
    }

    // 初回は権限ダイアログへの応答を待つ
    AsyncFunction("startBleScan") {
      do {
        try BleCentral.shared.startScan()
      } catch {
        throw GnssReceiverException(errorMessage(error))
      }
    }.runOnQueue(workQueue)

    Function("stopBleScan") {
      BleCentral.shared.stopScan()
    }

    // 接続完了まで待つ（最大20秒）
    AsyncFunction("connectBle") { (address: String) throws -> [String: Any] in
      BleCentral.shared.stopScan()
      do {
        try GnssSession.shared.attachLink { onData, onError in
          try BleLink(address: address, onData: onData, onError: onError)
        }
      } catch {
        throw GnssReceiverException(errorMessage(error))
      }
      return GnssSession.shared.status()
    }.runOnQueue(workQueue)

    AsyncFunction("disconnect") {
      GnssSession.shared.detachLink()
    }

    AsyncFunction("startNtrip") { (config: NtripConfigRecord) in
      let c = config.toConfig()
      if c.host.isEmpty || c.mountpoint.isEmpty { throw GnssReceiverException("host and mountpoint are required") }
      GnssSession.shared.startNtrip(c)
    }

    AsyncFunction("stopNtrip") {
      GnssSession.shared.stopNtrip()
    }

    // ネットワークI/Oを待つ
    AsyncFunction("getSourceTable") { (config: NtripConfigRecord) throws -> String in
      do {
        return try fetchSourceTable(config.toConfig(mountpoint: ""))
      } catch {
        throw GnssReceiverException(errorMessage(error))
      }
    }.runOnQueue(workQueue)
  }
}

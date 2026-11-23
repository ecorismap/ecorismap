import UIKit
internal import Expo
import React
import ReactAppDependencyProvider
import Firebase
import RNFBAppCheck
import GoogleMaps

@UIApplicationMain
@objc(AppDelegate)
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: ExpoReactNativeFactory?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Initialize Firebase App Check
    let _ = RNFBAppCheckModule.sharedInstance()

    // Configure Firebase
    FirebaseApp.configure()

    excludeTileFolderFromBackup()

    // Configure Google Maps
    if let filePath = Bundle.main.path(forResource: "Maps", ofType: "plist"),
       let plistDictionary = NSDictionary(contentsOfFile: filePath) as? [String: Any],
       let mapsAPIKey = plistDictionary["APIKey"] as? String {
      GMSServices.provideAPIKey(mapsAPIKey)
    }

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions
    )

    // ExpoAppDelegate forwards this to the registered subscribers (Expo modules等),
    // so必ず super を呼んでから戻り値を返す。
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func applicationDidEnterBackground(_ application: UIApplication) {
    // 起動中にタイルフォルダが消されて作り直されると除外が外れるので、バックアップが走りうる背面移行時にも付け直す
    excludeTileFolderFromBackup()
    super.applicationDidEnterBackground(application)
  }

  // MARK: - Tile cache

  // 地図タイル（Documents/tiles、JSのTILE_FOLDER）は配信元から取り直せるので、
  // iCloud・端末バックアップの容量を圧迫しないよう対象外にする（Apple の iOS Data Storage Guidelines）。
  // 属性はフォルダ自体に付くので、先に作ってから付ける
  private func excludeTileFolderFromBackup() {
    let fileManager = FileManager.default
    guard let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
      return
    }
    var tiles = documents.appendingPathComponent("tiles", isDirectory: true)
    do {
      try fileManager.createDirectory(at: tiles, withIntermediateDirectories: true)
      if (try? tiles.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup) == true {
        return
      }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try tiles.setResourceValues(values)
    } catch {
      NSLog("AppDelegate: failed to exclude tiles folder from backup: \(error.localizedDescription)")
    }
  }

  // MARK: - Linking API

  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey : Any] = [:]
  ) -> Bool {
    // Expo のサブスクライバへ先に通知してから、RN の Linking でも処理する。
    let handledBySubscribers = super.application(app, open: url, options: options)
    return RCTLinkingManager.application(app, open: url, options: options) || handledBySubscribers
  }

  // MARK: - Universal Links

  override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let handledBySubscribers = super.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
    return RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    ) || handledBySubscribers
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

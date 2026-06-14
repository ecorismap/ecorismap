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

package jp.co.ecoris.ecorismap

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BatteryOptimizationModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "BatteryOptimization"

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(true)
      return
    }

    val context = reactApplicationContext
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    if (powerManager == null) {
      promise.resolve(true)
      return
    }

    promise.resolve(powerManager.isIgnoringBatteryOptimizations(context.packageName))
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(false)
      return
    }

    val context = currentActivity ?: reactApplicationContext
    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
      data = Uri.parse("package:${context.packageName}")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    try {
      currentActivity?.startActivity(intent) ?: context.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_BATTERY_OPTIMIZATION", "Failed to open battery optimization settings", error)
    }
  }
}

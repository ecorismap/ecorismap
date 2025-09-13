package jp.co.ecoris.ecorismap

import android.content.ContentResolver
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.FileReader
import java.io.InputStream
import java.io.OutputStream
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import com.google.android.play.core.integrity.IntegrityTokenResponse


class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme)
    super.onCreate(null)

    val screenLayoutSize = resources.configuration.screenLayout and Configuration.SCREENLAYOUT_SIZE_MASK
    if (screenLayoutSize == Configuration.SCREENLAYOUT_SIZE_SMALL ||
        screenLayoutSize == Configuration.SCREENLAYOUT_SIZE_NORMAL
    ) {
      requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }
    // --- Standard モード呼び出し ---
    val integrityManager = IntegrityManagerFactory.create(this)

    val request = IntegrityTokenRequest.builder()
        .setCloudProjectNumber(498883984098) // Google Play プロジェクト番号
        .setNonce("任意のランダム文字列")      // サーバーで検証する場合は必須
        .build()

    integrityManager.requestIntegrityToken(request)
        .addOnSuccessListener { response: IntegrityTokenResponse ->
            val token = response.token()
            Log.d("IntegrityAPI", "Standard Token: $token")
            // 必要ならサーバーに送信して検証
        }
        .addOnFailureListener { exception ->
            Log.e("IntegrityAPI", "Failed: ${exception.message}")
        }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    val data = intent.data
    if (data != null) {
      try {
        Log.d("ecorismapLog", "Start Import")
        importData(data)
      } catch (e: Exception) {
        Log.e("File Import Error", e.message ?: "Unknown error")
      }
    }
    intent.data = null
  }

  override fun onResume() {
    super.onResume()
    val data = intent.data
    if (data != null) {
      try {
        Log.d("ecorismapLog", "Start Import")
        importData(data)
      } catch (e: Exception) {
        Log.e("File Import Error", e.message ?: "Unknown error")
      }
    }
    intent.data = null
  }

  private fun importData(data: Uri) {
    val scheme = data.scheme
    if (ContentResolver.SCHEME_CONTENT == scheme) {
      try {
        val cr = applicationContext.contentResolver
        val inputStream = cr.openInputStream(data) ?: return

        val name = getContentName(cr, data)
        Log.d("ecorismapLog", name ?: "No name")
        val packageManager = packageManager
        val packageName = packageName
        val packageInfo = packageManager.getPackageInfo(packageName, 0)
        val dataDir = packageInfo.applicationInfo?.dataDir ?: return

        val filePath = "$dataDir/cache/$name"
        inputStreamToFile(inputStream, filePath)

        // 新しく追加した部分: ファイルの内容を読み込んでログに出力
        val fileContent = readFile(filePath)
        Log.d("ecorismapLog", "File content: $fileContent")

      } catch (e: Exception) {
        Log.e("File Import Error", e.message ?: "Unknown error")
      }
    }
  }

  private fun getContentName(resolver: ContentResolver, uri: Uri): String? {
    val cursor = resolver.query(uri, null, null, null, null)
    cursor?.use {
      val nameIndex = it.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME)
      it.moveToFirst()
      if (nameIndex >= 0) {
        return it.getString(nameIndex)
      }
    }
    return null
  }

  private fun inputStreamToFile(inputStream: InputStream, filePath: String) {
    try {
      FileOutputStream(File(filePath)).use { output ->
        val buffer = ByteArray(1024)
        var size: Int
        while (inputStream.read(buffer).also { size = it } != -1) {
          output.write(buffer, 0, size)
        }
        output.flush()
      }
    } catch (e: Exception) {
      Log.e("MainActivity", "InputStreamToFile exception: ${e.message}")
    }
  }

  // 新しく追加したメソッド
  private fun readFile(filePath: String): String {
    return try {
      BufferedReader(FileReader(filePath)).use { reader ->
        reader.readText()
      }
    } catch (e: Exception) {
      Log.e("File Read Error", "Error reading file: ${e.message}")
      ""
    }
  }
}
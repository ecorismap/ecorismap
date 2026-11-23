package jp.co.ecoris.ecorismap

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.rnmaps.maps.MapPMTileProvider
import java.io.File
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * 3D地形ビュー用: react-native-mapsパッチ内のPMTilesラスタライザ
 * （MVT+style.json→PNG。ベクタ/ラスタ両対応・オーバーズーム込み）をJSへ公開する。
 *
 * MapPMTileProviderは
 *  - ヘッダ/スタイル取得を非同期で始めるので、作った直後のgetTileは空になる（awaitInitializationで待つ）
 *  - colorMapping等の内部状態を持ちスレッドセーフでない
 * ため、生成・呼び出しとも単一のバックグラウンドexecutorで直列実行する。
 */
class PMTileRasterizerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()
  private val providers = ConcurrentHashMap<String, MapPMTileProvider>()

  override fun getName(): String = "PMTileRasterizer"

  companion object {
    // ヘッダ・メタデータ取得のタイムアウト（各30秒）に揃える
    private const val INIT_TIMEOUT_MS = 60_000L
  }

  /** file://スキームを外して実パスにする（2DのsetTileCachePathと同じ規約） */
  private fun stripFileScheme(path: String): String =
    if (path.startsWith("file://")) URI(path).path else path

  @ReactMethod
  fun renderTile(options: ReadableMap, promise: Promise) {
    val urlTemplate = options.getString("urlTemplate")
    val outputPath = options.getString("outputPath")
    if (urlTemplate == null || outputPath == null) {
      promise.reject("E_ARGS", "urlTemplate and outputPath are required")
      return
    }
    val styleURL = options.getString("styleURL") ?: ""
    val tileCachePath = options.getString("tileCachePath")?.let { stripFileScheme(it) }
    val z = options.getInt("z")
    val x = options.getInt("x")
    val y = options.getInt("y")
    val minimumZ = if (options.hasKey("minimumZ")) options.getInt("minimumZ") else 0
    val maximumZ = if (options.hasKey("maximumZ")) options.getInt("maximumZ") else 22
    val maximumNativeZ = if (options.hasKey("maximumNativeZ")) options.getInt("maximumNativeZ") else 18
    val flipY = options.hasKey("flipY") && options.getBoolean("flipY")
    val offlineMode = options.hasKey("offlineMode") && options.getBoolean("offlineMode")
    val isVector = options.hasKey("isVector") && options.getBoolean("isVector")

    executor.execute {
      try {
        val key = listOf(urlTemplate, styleURL, tileCachePath, maximumNativeZ, offlineMode, isVector).joinToString("|")
        val provider = providers.getOrPut(key) {
          MapPMTileProvider(
            256, false, urlTemplate, styleURL,
            maximumZ, maximumNativeZ, minimumZ, flipY,
            tileCachePath, 0, offlineMode, isVector,
            reactApplicationContext, false
          )
        }
        // 初期化前に描くと空タイルが返り、3Dはそれを「タイルなし」として恒久的に記録してしまう。
        // executor上なので待ってよい（2Dと違い後から読み直す仕組みがない）
        provider.awaitInitialization(INIT_TIMEOUT_MS)
        val tile = provider.getTile(x, y, z)
        val data = tile?.data
        if (data == null || data.isEmpty()) {
          // 0 は「タイルが無い」と確定したときだけ返す（JS が0バイトの印を書いて以後取りに来ない）。
          // 通信失敗・ヘッダー未取得・オフラインの未保存範囲は reject して、次の機会に取り直させる
          if (provider.wasLastMissTransient()) {
            promise.reject("E_TILE_UNAVAILABLE", "tile temporarily unavailable: $z/$x/$y")
          } else {
            promise.resolve(0)
          }
          return@execute
        }
        val outFile = File(stripFileScheme(outputPath))
        outFile.parentFile?.mkdirs()
        // 途中で失敗しても書きかけの画像がキャッシュとして残らないよう、一時ファイルから置き換える
        val tmpFile = File(outFile.path + ".tmp")
        try {
          tmpFile.writeBytes(data)
          if (!tmpFile.renameTo(outFile)) throw java.io.IOException("rename failed: ${outFile.path}")
        } finally {
          tmpFile.delete()
        }
        promise.resolve(tile.width)
      } catch (e: Exception) {
        promise.reject("E_RENDER", e.message, e)
      }
    }
  }

  /** レイヤ設定変更時などにプロバイダキャッシュを捨てる */
  @ReactMethod
  fun clearProviders(promise: Promise) {
    executor.execute {
      providers.clear()
      promise.resolve(null)
    }
  }
}

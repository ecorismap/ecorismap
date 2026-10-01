package expo.modules.demdecoder

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.jni.NativeArrayBuffer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** 戻り値ArrayBufferの先頭に置くFloat32の個数（iOS版と同じ並び） */
private const val HEADER_FLOATS = 8

/**
 * 標高タイル（WebP/PNG）を標高[m]のFloat32配列へデコードする。
 *
 * 色の変換でRGB値が変わると標高が壊れるため、アルファ乗算なし・sRGBのまま展開する。
 */
class DemDecoderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DemDecoder")

    // 非同期関数はモジュールのキュー（JSスレッド外）で実行される。
    // 戻り値は1本のArrayBuffer（コピーなしでJSへ渡せる）: 先頭8個のFloat32が
    // [width, height, min, max, readMs, decodeMs, convertMs, 予備]、続いて標高[m]が行優先で並ぶ
    AsyncFunction("decodeFile") { fileUri: String, encoding: String ->
      val startNs = System.nanoTime()
      val path = if (fileUri.startsWith("file://")) Uri.parse(fileUri).path!! else fileUri
      val bytes = File(path).readBytes()
      val readNs = System.nanoTime()

      val options = BitmapFactory.Options().apply {
        inPremultiplied = false
        inPreferredConfig = Bitmap.Config.ARGB_8888
        inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
        inScaled = false
      }
      val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        ?: throw DemDecodeException("decode failed")
      val width = bitmap.width
      val height = bitmap.height
      val count = width * height
      val pixels = IntArray(count)
      bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
      bitmap.recycle()
      val decodedNs = System.nanoTime()

      val buffer = ByteBuffer.allocateDirect((HEADER_FLOATS + count) * 4).order(ByteOrder.nativeOrder())
      val out = buffer.asFloatBuffer()
      var minElev = Float.POSITIVE_INFINITY
      var maxElev = Float.NEGATIVE_INFINITY
      if (encoding == "terrarium") {
        for (i in 0 until count) {
          val c = pixels[i]
          val e = ((c shr 16) and 0xff) * 256f + ((c shr 8) and 0xff) + (c and 0xff) / 256f - 32768f
          out.put(HEADER_FLOATS + i, e)
          if (e < minElev) minElev = e
          if (e > maxElev) maxElev = e
        }
      } else {
        // 国土地理院方式: x = 2^16·R + 2^8·G + B、NoData=2^23、単位0.01m。
        // 透明画素（産総研タイルの整備範囲外）もNoData
        for (i in 0 until count) {
          val x = pixels[i] and 0xffffff
          if (x == 8_388_608 || (pixels[i] ushr 24) == 0) {
            out.put(HEADER_FLOATS + i, Float.NaN)
            continue
          }
          val e = (if (x < 8_388_608) x else x - 16_777_216) / 100f
          out.put(HEADER_FLOATS + i, e)
          if (e < minElev) minElev = e
          if (e > maxElev) maxElev = e
        }
      }
      val endNs = System.nanoTime()

      out.put(0, width.toFloat())
      out.put(1, height.toFloat())
      out.put(2, if (minElev.isFinite()) minElev else Float.NaN)
      out.put(3, if (maxElev.isFinite()) maxElev else Float.NaN)
      out.put(4, (readNs - startNs) / 1e6f)
      out.put(5, (decodedNs - readNs) / 1e6f)
      out.put(6, (endNs - decodedNs) / 1e6f)
      out.put(7, 0f)
      NativeArrayBuffer(buffer)
    }
  }
}

private class DemDecodeException(message: String) : CodedException(message)

package expo.modules.photoconverter

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * 写真（HEIF・WebPなど）をJPEGへ変換し、元のEXIF（撮影位置・撮影日時・機種・向きなど）を書き戻す。
 *
 * expo-image-manipulator ではEXIFが落ちるため。画素は回転させず（BitmapFactoryは向きを適用しない）、
 * 向きはタグのまま残す。画像の構造を表すタグ（寸法・圧縮・サムネイル位置など）は新しいJPEGの値を使う。
 */
class PhotoConverterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PhotoConverter")

    AsyncFunction("convertToJpeg") { srcUri: String, dstUri: String, quality: Double ->
      val srcPath = toPath(srcUri)
      val dstPath = toPath(dstUri)
      val bitmap = BitmapFactory.decodeFile(srcPath)
        ?: throw CodedException("ERR_PHOTO_DECODE", "画像を読み込めません: $srcUri", null)
      try {
        File(dstPath).parentFile?.mkdirs()
        FileOutputStream(dstPath).use { out ->
          val q = (quality * 100).toInt().coerceIn(1, 100)
          if (!bitmap.compress(Bitmap.CompressFormat.JPEG, q, out)) {
            throw CodedException("ERR_PHOTO_ENCODE", "JPEGへの書き出しに失敗しました: $dstUri", null)
          }
        }
      } finally {
        bitmap.recycle()
      }
      copyExif(srcPath, dstPath)
    }
  }

  private fun toPath(uri: String): String = if (uri.startsWith("file://")) Uri.parse(uri).path!! else uri

  // EXIFの引き継ぎは付加的な処理なので、失敗しても変換したJPEGは使う
  private fun copyExif(srcPath: String, dstPath: String) {
    try {
      val from = ExifInterface(srcPath)
      val to = ExifInterface(dstPath)
      for (tag in copyableTags) {
        from.getAttribute(tag)?.let { to.setAttribute(tag, it) }
      }
      to.saveAttributes()
    } catch (e: Exception) {
      android.util.Log.w("PhotoConverter", "EXIFの引き継ぎに失敗しました", e)
    }
  }

  companion object {
    // 新しいJPEGの値を使うべき、画像の構造を表すタグ
    private val structuralTags = setOf(
      ExifInterface.TAG_IMAGE_WIDTH,
      ExifInterface.TAG_IMAGE_LENGTH,
      ExifInterface.TAG_PIXEL_X_DIMENSION,
      ExifInterface.TAG_PIXEL_Y_DIMENSION,
      ExifInterface.TAG_COMPRESSION,
      ExifInterface.TAG_BITS_PER_SAMPLE,
      ExifInterface.TAG_SAMPLES_PER_PIXEL,
      ExifInterface.TAG_PHOTOMETRIC_INTERPRETATION,
      ExifInterface.TAG_PLANAR_CONFIGURATION,
      ExifInterface.TAG_STRIP_OFFSETS,
      ExifInterface.TAG_STRIP_BYTE_COUNTS,
      ExifInterface.TAG_ROWS_PER_STRIP,
      ExifInterface.TAG_JPEG_INTERCHANGE_FORMAT,
      ExifInterface.TAG_JPEG_INTERCHANGE_FORMAT_LENGTH,
      ExifInterface.TAG_THUMBNAIL_IMAGE_LENGTH,
      ExifInterface.TAG_THUMBNAIL_IMAGE_WIDTH,
      ExifInterface.TAG_Y_CB_CR_SUB_SAMPLING,
      ExifInterface.TAG_Y_CB_CR_POSITIONING,
      ExifInterface.TAG_Y_CB_CR_COEFFICIENTS,
    )

    // ExifInterfaceが定義するタグ名（TAG_*の文字列定数）のうち、構造を表すもの以外すべて
    private val copyableTags: List<String> by lazy {
      ExifInterface::class.java.fields
        .filter { it.name.startsWith("TAG_") && it.type == String::class.java && java.lang.reflect.Modifier.isStatic(it.modifiers) }
        .mapNotNull { it.get(null) as? String }
        .filter { it !in structuralTags }
        .distinct()
    }
  }
}

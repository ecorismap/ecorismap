/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the LICENSE file in the root
 * directory of this source tree.
 */
package com.reactnativecommunity.imageeditor

import android.annotation.SuppressLint
import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Bitmap.CompressFormat
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Matrix
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.text.TextUtils
import androidx.exifinterface.media.ExifInterface
import com.facebook.common.logging.FLog
import com.facebook.infer.annotation.Assertions
import com.facebook.react.bridge.JSApplicationIllegalArgumentException
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.common.ReactConstants
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.URL
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min
import android.graphics.Canvas
import android.util.Log
import android.graphics.Paint

class ImageEditorModuleImpl(private val reactContext: ReactApplicationContext) {
    private val moduleCoroutineScope = CoroutineScope(Dispatchers.Default)

    init {
        cleanTask()
    }

    fun invalidate() {
        if (moduleCoroutineScope.isActive) {
            moduleCoroutineScope.cancel()
        }
        cleanTask()
    }

    /**
     * Asynchronous task that cleans up cache dirs (internal and, if available, external) of cropped
     * image files. This is run when the module is invalidated (i.e. app is shutting down) and when
     * the module is instantiated, to handle the case where the app crashed.
     */
    private fun cleanTask() {
        moduleCoroutineScope.launch {
            cleanDirectory(reactContext.cacheDir)
            val externalCacheDir = reactContext.externalCacheDir
            externalCacheDir?.let { cleanDirectory(it) }
        }
    }

    private fun cleanDirectory(directory: File) {
        val toDelete = directory.listFiles { _, filename -> filename.startsWith(TEMP_FILE_PREFIX) }
        if (toDelete != null) {
            for (file in toDelete) {
                file.delete()
            }
        }
    }

    /**
     * Crop an image. If all goes well, the promise will be resolved with the file:// URI of the new
     * image as the only argument. This is a temporary file - consider using
     * CameraRollManager.saveImageWithTag to save it in the gallery.
     *
     * @param uri the URI of the image to crop
     * @param options crop parameters specified as `{offset: {x, y}, size: {width, height}}`.
     *   Optionally this also contains `{targetSize: {width, height}}`. If this is specified, the
     *   cropped image will be resized to that size. All units are in pixels (not DPs).
     * @param promise Promise to be resolved when the image has been cropped; the only argument that
     *   is passed to this is the file:// URI of the new image
     */
    fun cropImage(uri: String?, options: ReadableMap, promise: Promise) {
        val offset = if (options.hasKey("offset")) options.getMap("offset") else null
        val size = if (options.hasKey("size")) options.getMap("size") else null
        val quality =
            if (options.hasKey("quality")) (options.getDouble("quality") * 100).toInt() else 90
        if (
            offset == null ||
                size == null ||
                !offset.hasKey("x") ||
                !offset.hasKey("y") ||
                !size.hasKey("width") ||
                !size.hasKey("height")
        ) {
            throw JSApplicationIllegalArgumentException("Please specify offset and size")
        }
        if (uri.isNullOrEmpty()) {
            throw JSApplicationIllegalArgumentException("Please specify a URI")
        }
        if (quality > 100 || quality < 0) {
            promise.reject(
                JSApplicationIllegalArgumentException("quality must be a number between 0 and 1")
            )
            return
        }
        val x = offset.getDouble("x").toInt()
        val y = offset.getDouble("y").toInt()
        val width = size.getDouble("width").toInt()
        val height = size.getDouble("height").toInt()
        val (targetWidth, targetHeight) =
            if (options.hasKey("displaySize")) {
                val targetSize = options.getMap("displaySize")!!
                Pair(targetSize.getDouble("width").toInt(), targetSize.getDouble("height").toInt())
            } else Pair(0, 0)

        moduleCoroutineScope.launch {
            try {
                val outOptions = BitmapFactory.Options()

                // If we're downscaling, we can decode the bitmap more efficiently, using less
                // memory
                val hasTargetSize = targetWidth > 0 && targetHeight > 0
                val cropped: Bitmap? =
                    if (hasTargetSize) {
                        cropAndResizeTask(
                            outOptions,
                            uri,
                            x,
                            y,
                            width,
                            height,
                            targetWidth,
                            targetHeight
                        )
                    } else {
                        cropTask(outOptions, uri, x, y, width, height)
                    }
                if (cropped == null) {
                    throw IOException("Cannot decode bitmap: $uri")
                }
                val mimeType = outOptions.outMimeType
                if (mimeType.isNullOrEmpty()) {
                    throw IOException("Could not determine MIME type")
                }

                val tempFile = createTempFile(reactContext, mimeType)
                writeCompressedBitmapToFile(cropped, mimeType, tempFile, quality)
                if (mimeType == "image/jpeg") {
                    copyExif(reactContext, Uri.parse(uri), tempFile)
                }
                promise.resolve(Uri.fromFile(tempFile).toString())
            } catch (e: Exception) {
                promise.reject(e)
            }
        }
    }

    /**
     * Reads and crops the bitmap.
     *
     * @param outOptions Bitmap options, useful to determine `outMimeType`.
     * @param uri the URI of the image to crop
     * @param x left coordinate of the cropped image
     * @param y top coordinate of the cropped image
     * @param width width of the cropped image
     * @param height height of the cropped image
     */
    private fun cropTask(
        outOptions: BitmapFactory.Options,
        uri: String,
        x: Int,
        y: Int,
        width: Int,
        height: Int
    ): Bitmap? {
        val resultBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        return openBitmapInputStream(uri)?.use {
            // Efficiently crops image without loading full resolution into memory
            // https://developer.android.com/reference/android/graphics/BitmapRegionDecoder.html
            val decoder =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    BitmapRegionDecoder.newInstance(it)
                } else {
                    @Suppress("DEPRECATION") BitmapRegionDecoder.newInstance(it, false)
                }
            return@use try {

                val cropStartX = if(x<0) 0 else x
                val cropStartY = if(y<0) 0 else y
                
              
                val cropEndX = if(x+width>decoder!!.width) decoder!!.width else (x+width)
                val cropEndY = if(y+height>decoder!!.height) decoder!!.height else (y+height)
                val cropWidth = cropEndX - cropStartX
                val cropHeight = cropEndY - cropStartY 
    
                var rect: Rect
                if (cropWidth <= 0 || cropHeight <= 0){
                    rect = Rect(0, 0, 1, 1)
                }else{
                    rect = Rect(cropStartX, cropStartY, cropEndX, cropEndY)
                }
                val croppedBitmap = decoder!!.decodeRegion(rect, outOptions)
        
                val posX = if(x<0) -1*x else 0
                val posY = if(y<0) -1*y else 0
                Canvas(resultBitmap).apply {
                    drawBitmap(croppedBitmap, posX.toFloat(), posY.toFloat(), null)
                }
                return resultBitmap
            } finally {
                decoder!!.recycle()
            }
        }
    }

    /**
     * Crop the rectangle given by `mX, mY, mWidth, mHeight` within the source bitmap and scale the
     * result to `targetWidth, targetHeight`.
     *
     * @param outOptions Bitmap options, useful to determine `outMimeType`.
     * @param uri the URI of the image to crop
     * @param x left coordinate of the cropped image
     * @param y top coordinate of the cropped image
     * @param width width of the cropped image
     * @param height height of the cropped image
     * @param targetWidth width of the resized image
     * @param targetHeight height of the resized image
     */
    private fun cropAndResizeTask(
        outOptions: BitmapFactory.Options,
        uri: String,
        x: Int,
        y: Int,
        width: Int,
        height: Int,
        targetWidth: Int,
        targetHeight: Int,
    ): Bitmap? {
        Assertions.assertNotNull(outOptions)


        val cropScaleX = targetWidth/width.toFloat()
        val cropScaleY = targetHeight/height.toFloat()
        val scaleMatrix = Matrix().apply { setScale(cropScaleX, cropScaleY) }
        val filter = true

        val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
        
        val resultBitmap =  openBitmapInputStream(uri)?.use {
            // Efficiently crops image without loading full resolution into memory
            // https://developer.android.com/reference/android/graphics/BitmapRegionDecoder.html
            val decoder =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    BitmapRegionDecoder.newInstance(it)
                } else {
                    @Suppress("DEPRECATION") BitmapRegionDecoder.newInstance(it, false)
                }
            return@use try {

                val cropStartX = if(x<0) 0 else x
                val cropStartY = if(y<0) 0 else y
                
              
                val cropEndX = if(x+width>decoder!!.width) decoder!!.width else (x+width)
                val cropEndY = if(y+height>decoder!!.height) decoder!!.height else (y+height)
                val cropWidth = cropEndX - cropStartX
                val cropHeight = cropEndY - cropStartY 
    
                var rect: Rect
                if (cropWidth <= 0 || cropHeight <= 0){
                    rect = Rect(0, 0, 1, 1)
                }else{
                    rect = Rect(cropStartX, cropStartY, cropEndX, cropEndY)
                }
                val croppedBitmap = decoder!!.decodeRegion(rect, outOptions)
        
                val posX = if(x<0) -1*x else 0
                val posY = if(y<0) -1*y else 0
                //scaleMatrixを使ってリサイズ
                Canvas(bitmap).apply {
                    val paint = Paint() // 描画に使用するPaintオブジェクトを作成
                    // 必要に応じてPaintオブジェクトをカスタマイズ
                    val matrix = Matrix().apply {
                        postTranslate(posX.toFloat(), posY.toFloat())
                        postScale(cropScaleX, cropScaleY)
                    }
                    drawBitmap(croppedBitmap, matrix, paint)
                }

                // Canvas(resultBitmap).apply {
                //     drawBitmap(croppedBitmap, posX.toFloat(), posY.toFloat(), null)
                // }
                return bitmap
            } finally {
                decoder!!.recycle()
            }
        }

        return resultBitmap

        //return Bitmap.createBitmap(bitmap, cropX, cropY, cropWidth, cropHeight, scaleMatrix, filter)
    }

    private fun openBitmapInputStream(uri: String): InputStream? {
        return if (isLocalUri(uri)) {
            reactContext.contentResolver.openInputStream(Uri.parse(uri))
        } else {
            val connection = URL(uri).openConnection()
            connection.getInputStream()
        }
    }

    companion object {
        const val NAME = "RNCImageEditor"
        private val LOCAL_URI_PREFIXES =
            listOf(
                ContentResolver.SCHEME_FILE,
                ContentResolver.SCHEME_CONTENT,
                ContentResolver.SCHEME_ANDROID_RESOURCE
            )
        private const val TEMP_FILE_PREFIX = "ReactNative_cropped_image_"

        @SuppressLint("InlinedApi")
        private val EXIF_ATTRIBUTES =
            arrayOf(
                ExifInterface.TAG_DATETIME,
                ExifInterface.TAG_DATETIME_DIGITIZED,
                ExifInterface.TAG_EXPOSURE_TIME,
                ExifInterface.TAG_FLASH,
                ExifInterface.TAG_FOCAL_LENGTH,
                ExifInterface.TAG_GPS_ALTITUDE,
                ExifInterface.TAG_GPS_ALTITUDE_REF,
                ExifInterface.TAG_GPS_DATESTAMP,
                ExifInterface.TAG_GPS_LATITUDE,
                ExifInterface.TAG_GPS_LATITUDE_REF,
                ExifInterface.TAG_GPS_LONGITUDE,
                ExifInterface.TAG_GPS_LONGITUDE_REF,
                ExifInterface.TAG_GPS_PROCESSING_METHOD,
                ExifInterface.TAG_GPS_TIMESTAMP,
                ExifInterface.TAG_IMAGE_LENGTH,
                ExifInterface.TAG_IMAGE_WIDTH,
                ExifInterface.TAG_MAKE,
                ExifInterface.TAG_MODEL,
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.TAG_SUBSEC_TIME,
                ExifInterface.TAG_WHITE_BALANCE
            )

        // Utils
        @Throws(IOException::class)
        private fun copyExif(context: Context, oldImage: Uri, newFile: File) {
            val oldFile = getFileFromUri(context, oldImage)
            if (oldFile == null) {
                FLog.w(ReactConstants.TAG, "Couldn't get real path for uri: $oldImage")
                return
            }
            val oldExif = ExifInterface(oldFile.absolutePath)
            val newExif = ExifInterface(newFile.absolutePath)
            for (attribute in EXIF_ATTRIBUTES) {
                val value = oldExif.getAttribute(attribute)
                if (value != null) {
                    newExif.setAttribute(attribute, value)
                }
            }
            newExif.saveAttributes()
        }

        private fun getFileFromUri(context: Context, uri: Uri): File? {
            if (uri.scheme == "file") {
                return uri.path?.let { File(it) }
            }
            if (uri.scheme == "content") {
                context.contentResolver
                    .query(uri, arrayOf(MediaStore.MediaColumns.DATA), null, null, null)
                    ?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val path = cursor.getString(0)
                            if (!TextUtils.isEmpty(path)) {
                                return File(path)
                            }
                        }
                    }
            }
            return null
        }

        private fun isLocalUri(uri: String): Boolean {
            for (localPrefix in LOCAL_URI_PREFIXES) {
                if (uri.startsWith(localPrefix)) {
                    return true
                }
            }
            return false
        }

        private fun getFileExtensionForType(mimeType: String?): String {
            return when (mimeType) {
                "image/png" -> ".png"
                "image/webp" -> ".webp"
                else -> ".jpg"
            }
        }

        private fun getCompressFormatForType(mimeType: String): CompressFormat {
            val webpCompressFormat =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    CompressFormat.WEBP_LOSSY
                } else {
                    @Suppress("DEPRECATION") CompressFormat.WEBP
                }
            return when (mimeType) {
                "image/png" -> CompressFormat.PNG
                "image/webp" -> webpCompressFormat
                else -> CompressFormat.JPEG
            }
        }

        @Throws(IOException::class)
        private fun writeCompressedBitmapToFile(
            cropped: Bitmap,
            mimeType: String,
            tempFile: File,
            compressQuality: Int
        ) {
            FileOutputStream(tempFile).use {
                cropped.compress(getCompressFormatForType(mimeType), compressQuality, it)
            }
        }

        /**
         * Create a temporary file in the cache directory on either internal or external storage,
         * whichever is available and has more free space.
         *
         * @param mimeType the MIME type of the file to create (image/ *)
         */
        @Throws(IOException::class)
        private fun createTempFile(context: Context, mimeType: String?): File {
            val externalCacheDir = context.externalCacheDir
            val internalCacheDir = context.cacheDir
            if (externalCacheDir == null && internalCacheDir == null) {
                throw IOException("No cache directory available")
            }
            val cacheDir: File? =
                if (externalCacheDir == null) {
                    internalCacheDir
                } else if (internalCacheDir == null) {
                    externalCacheDir
                } else {
                    if (externalCacheDir.freeSpace > internalCacheDir.freeSpace) externalCacheDir
                    else internalCacheDir
                }
            return File.createTempFile(
                TEMP_FILE_PREFIX,
                getFileExtensionForType(mimeType),
                cacheDir
            )
        }

        /**
         * When scaling down the bitmap, decode only every n-th pixel in each dimension. Calculate
         * the largest `inSampleSize` value that is a power of 2 and keeps both `width, height`
         * larger or equal to `targetWidth, targetHeight`. This can significantly reduce memory
         * usage.
         */
        private fun getDecodeSampleSize(
            width: Int,
            height: Int,
            targetWidth: Int,
            targetHeight: Int
        ): Int {
            var inSampleSize = 1
            if (height > targetHeight || width > targetWidth) {
                val halfHeight = height / 2
                val halfWidth = width / 2
                while (
                    halfWidth / inSampleSize >= targetWidth &&
                        halfHeight / inSampleSize >= targetHeight
                ) {
                    inSampleSize *= 2
                }
            }
            return inSampleSize
        }
    }
}

# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep JNI native methods
-keepclassmembers class * {
    native <methods>;
}

# Virgil Security (SWIG JNI - FindClass/GetFieldIDで名前解決するため必須)
-keep class com.virgilsecurity.** { *; }
-dontwarn com.virgilsecurity.**

# GDAL (SWIG JNI - FindClass/GetFieldIDで名前解決するため必須)
-keep class org.gdal.** { *; }
-dontwarn org.gdal.**
-keep class com.gdalwarp.** { *; }

# Nitro Modules / MMKV (JNIがkJavaDescriptorの完全修飾名でクラス解決)
-keep class com.margelo.nitro.** { *; }

# kuromoji (辞書をjar内リソース+リフレクションで読む)
-keep class com.atilika.kuromoji.** { *; }
-dontwarn com.atilika.kuromoji.**

# gson 2.8.8 (react-native-mapsのpatchで追加、proguard rules非同梱の版)
-keepattributes Signature,*Annotation*,InnerClasses,EnclosingMethod
-dontwarn com.google.gson.**
# TypeTokenの匿名サブクラス（new TypeToken<VectorStyle>(){}）はジェネリック型解決に使われる
-keep,allowobfuscation,allowshrinking class com.google.gson.reflect.TypeToken
-keep,allowobfuscation,allowshrinking class * extends com.google.gson.reflect.TypeToken

# react-native-mapsのPMTilesベクタタイル（patchで追加されたスタイル解釈まわり）
# style.jsonとPMTilesのメタデータをGsonがフィールド名でマッピングするため、R8で
# 難読化されるとVectorStyle.layers等がnullになり、2D地図のベクタが一切描画されなくなる
# （@SerializedName付きのフィールドしか生き残らない）。クラッシュしないので気づきにくい。
-keep class VectorTileStyle.** { *; }
-keep class VectorTileStyleManager.** { *; }
-keep class PMTiles.** { *; }

# react-native-device-info (READMEで要求されているルール)
-keep class com.android.installreferrer.api.** { *; }
-keep class com.google.android.gms.common.** { *; }

# zip4j
-dontwarn net.lingala.zip4j.**

# expo headless app loader (AndroidManifestのmeta-data経由でClass.forNameされる)
-keep class expo.modules.adapters.react.apploader.RNHeadlessAppLoader { *; }

# react-native-webgpu (3Dビュー)
# ネイティブ側はJNIからJavaクラス・メソッドを解決するため、R8に削除・改名されると
# 3D表示時にリンクエラーで落ちる。
-keep class com.webgpu.** { *; }
-dontwarn com.webgpu.**

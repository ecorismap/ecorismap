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

# react-native-device-info (READMEで要求されているルール)
-keep class com.android.installreferrer.api.** { *; }
-keep class com.google.android.gms.common.** { *; }

# zip4j
-dontwarn net.lingala.zip4j.**

# expo headless app loader (AndroidManifestのmeta-data経由でClass.forNameされる)
-keep class expo.modules.adapters.react.apploader.RNHeadlessAppLoader { *; }

# expo-gl (3Dビュー)
# GLViewはExpoViewを継承せずTextureViewを直接継承するため、expo-modules-core同梱の
# 「-keepclassmembers class * implements expo.modules.kotlin.views.ExpoView」が当たらない。
# 生成はViewManagerWrapperのリフレクション経由なのでR8が生成箇所を認識できず、
# クラスをabstract化して(Context, AppContext)コンストラクタごと削除してしまい、
# 3D表示時に IllegalStateException: Didn't find a correct constructor で落ちる。
-keep class expo.modules.gl.** { *; }

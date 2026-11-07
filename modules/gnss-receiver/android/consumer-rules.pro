# usb-serial-for-androidはProbeTableからドライバをリフレクションで生成する
-keep class com.hoho.android.usbserial.driver.** { *; }
# Expoのレコード（JSから渡す設定オブジェクト）はフィールドをリフレクションで埋める
-keep class expo.modules.gnssreceiver.NtripConfigRecord { *; }

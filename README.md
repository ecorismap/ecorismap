EcorisMap
===================================
EcorisMapは、野外調査で位置情報を記録、確認できるアプリです。

EcorisMap is field survey application that records locations and information on a map


  
WebSite
-------------

https://ecoris-map.web.app


Documentation
-------------

  [English Document](https://ecoris-map.web.app/manual_en.html)
  
  [日本語のドキュメント](https://ecoris-map.web.app/manual_ja.html)


Build and Run
-------------
This app is developed with React Native + Expo (Bare Workflow). First, please install the development environment for it.

0. Install development tools. Xcode, Android Studio, node.js, yarn and expo-cli.
1. git clone https://github.com/ecorismap/ecorismap.git
2. cd ecorismap
3. yarn install
4. Obtain the Maps API KEY. Just the ones you want to run.
   - [API key for the Android SDK](https://developers.google.com/maps/documentation/android-sdk/get-api-key)
   - [API key for the iOS SDK](https://developers.google.com/maps/documentation/ios-sdk/get-api-key)
   - [API key for the MapTiler](https://cloud.maptiler.com/maps/)
5. Set API Key to the file in the template folder
   - **local.properties** for Android
   - **Maps.plist** for iOS
   - **APIKeys.ts** for MapTiler. 'Requires quotation marks'
6. Copy the file to the following location
   - cp template/local.properties android/
   - cp template/Maps.plist ios/ecorismap/Supporting/
   - cp template/APIKeys.ts src/constants/
7. Download react-native-gdalwarp module and replace it.
   - Download https://github.com/tmizu23/build_gdal_android_ios/releases/download/v0.0.1/react-native-gdalwarp.zip
   - unzip react-native-gdalwarp.zip
   - cp -r react-native-gdalwarp modules/
8. Build and Run on emulator
   - yarn android
   - yarn ios
   - yarn web

License
=======

 This software is released under the MIT License, see LICENSE.
_Copyright (c) 2022 ECORIS Inc._
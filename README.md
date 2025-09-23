EcorisMap
===================================
EcorisMap is a cross-platform field survey application that records locations and information on maps for outdoor surveys.

## Official Site
- https://ecorismap-pro.web.app

## Documentation
- [English Documentation](https://ecorismap-pro.web.app/manual_en.html)
- [Japanese Documentation](https://ecorismap-pro.web.app/manual_ja.html)

---

## Setup (Without Login Features)

### Prerequisites
- Node.js >= 22
- Yarn 3.6.4
- Xcode (for iOS development)
- Android Studio (for Android development)

### 1. Clone and Install Dependencies
```bash
git clone https://github.com/ecorismap/ecorismap.git
cd ecorismap
yarn install
```

### 2. Configure Maps API Keys

#### Android
1. Get [API key for Android SDK](https://developers.google.com/maps/documentation/android-sdk/get-api-key)
2. Create `android/local.properties` from template:
   ```bash
   cp template/local.properties android/
   ```
3. Edit `android/local.properties` and add your API key:
   ```
   MAPS_API_KEY=YOUR_ANDROID_MAPS_API_KEY
   ```
   
4. (Optional) For release builds, add Keystore configuration:
   ```
   MYAPP_UPLOAD_STORE_FILE=my-upload-key.keystore
   MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
   MYAPP_UPLOAD_STORE_PASSWORD=*****
   MYAPP_UPLOAD_KEY_PASSWORD=*****
   ```
   
   To create a keystore for release builds:
   ```bash
   cd android/app
   keytool -genkeypair -v -storetype PKCS12 -keystore my-upload-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```
   
   > **Important**: Keep your keystore file and passwords secure. Never commit them to version control.

#### iOS
1. Get [API key for iOS SDK](https://developers.google.com/maps/documentation/ios-sdk/get-api-key)
2. Copy Maps.plist template:
   ```bash
   cp template/Maps.plist ios/ecorismap/
   ```
3. Edit `ios/ecorismap/Maps.plist` and add your API key

#### Web (MapTiler)
1. Get [API key for MapTiler](https://cloud.maptiler.com/maps/)
2. Copy APIKeys template:
   ```bash
   cp template/APIKeys.ts src/constants/
   ```
3. Edit `src/constants/APIKeys.ts` and add your key (with quotes):
   ```typescript
   export const MAPTILER_API_KEY = 'YOUR_MAPTILER_API_KEY';
   ```

### 3. Setup GDAL Module
```bash
# Download GDAL module
wget https://github.com/tmizu23/build_gdal_android_ios/releases/download/v0.0.2/react-native-gdalwarp.zip
unzip react-native-gdalwarp.zip
cp -r react-native-gdalwarp modules/
rm -rf react-native-gdalwarp react-native-gdalwarp.zip
```

### 4. Disable Login Features
For basic setup, disable login features in `src/constants/AppConstants.ts`:
```typescript
export const FUNC_LOGIN = false;  // Disable login features
```

### 5. Run Development Server
```bash
yarn ios           # iOS simulator
yarn android       # Android emulator  
yarn web           # Web browser
```

---

## Advanced Setup (With Login Features)

Advanced setup adds Firebase-based user authentication, data storage, and server-side features.

> **Note**: The examples below use identifiers like `ecorismap` (project name) and `jp.co.ecoris.ecorismap` (bundle ID), but these should be replaced with your own project-specific values.

### 1. Enable Login Features
Edit `src/constants/AppConstants.ts` to enable login features:
```typescript
export const FUNC_LOGIN = true;  // Enable login features
```

### 2. Firebase Setup

#### Firebase Console Initial Setup

##### Create Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create new project with your desired name
3. Upgrade to Blaze plan (required for Functions)

##### Configure Firebase Services

**Authentication**
1. Enable Email/Password authentication
2. Configure authorized domains

**Firestore Database**
1. Create database (choose region closest to your users)
2. Set security rules:
   - Go to "Rules" tab
   - Copy content from `firestore.rules` (or edit template)
   - Click "Publish" to apply rules
3. Set indexes as they appear in console errors during development

**Storage**
1. Enable Firebase Storage (choose region closest to your users)
2. Set security rules:
   - Go to "Rules" tab
   - Copy content from `storage.rules` (or edit template)
   - Click "Publish" to apply rules

**App Check (Security)**
1. Enable App Check:
   - Web: Select reCAPTCHA v3
   - Android: Select Play Integrity
   - iOS: Select App Attest

2. Configure Play Integrity (Android):
   - Link Play Console to Firebase project:
     1. Go to Play Console → Your app → App integrity → Play Integrity API
     2. Click "Link a cloud project"
     3. Select your Firebase project from the list (or create new)
     4. Complete the linking process
   
   - Add SHA-256 certificate:
     1. In Play Console → App integrity
     2. Copy the SHA-256 certificate fingerprint from "App signing key certificate"
     3. Add it to Firebase Console → Project settings → Your Android app

3. For Web reCAPTCHA:
   - Create key pair at [Google reCAPTCHA](https://www.google.com/recaptcha/admin)
   - Add site key to src/constants/APIKeys.ts
   - Add secret key to Firebase Console App Check settings

4. Debug tokens for development:

   **Android Debug Token**
   ```bash
   # Run the app on emulator/device
   # Get debug token from logcat
   adb logcat | grep DebugAppCheckProvider
   
   # Look for output like:
   # D DebugAppCheckProvider: Enter this debug secret into the allow list in the Firebase Console for your project: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
   ```
   
   **iOS Debug Token**
   - Run the app on simulator/device
   - Check Xcode console for debug token
   - Look for: `Firebase App Check debug token: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`
   
   **Web Debug Token (Auto-generated)**
   - Automatically enabled for local development when:
     - Running in development environment (`NODE_ENV === 'development'`)
     - Accessing from localhost
     - Using Firebase emulators
   - Open browser console to see the debug token
   - Format: `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`
   
   **Registering Debug Tokens**
   1. Go to Firebase Console → App Check
   2. Select your app (Android/iOS/Web)
   3. Click "Manage" → "Debug tokens"
   4. Add the token from console output
   5. Give it a descriptive name (e.g., "Development Device", "iOS Simulator", "Localhost Dev")

##### Platform-specific App Configuration

**Android App**
1. Add app → Select "Android"
2. Configuration:
   - Package name: Your app's package name
   - SHA-1 certificate: 
     ```bash
     # Debug certificate (for development)
     cd android && ./gradlew signingReport
     ```
3. Download `google-services.json` and place in `android/app/`
4. For release: Add SHA-256 certificate from Play Console later

**iOS App**
1. Add app → Select "iOS"
2. Configuration:
   - Bundle ID: Your app's bundle ID
3. Download `GoogleService-Info.plist`
4. Add to Xcode project (Important: drag into `ios/ecorismap/` using Xcode)

**Web App**
1. Add app → Select "Web"
2. App nickname: Your app name for web
3. Check Firebase Hosting if you plan to use it
4. Copy the displayed configuration to src/constants/APIKeys.ts


### 3. Firebase Functions Setup

Firebase Functions provide server-side functionality and are required for Virgil E3Kit end-to-end encryption.

For detailed setup, deployment instructions, and troubleshooting, see [functions/README.md](../functions/README.md).

### 4. Firebase Hosting Setup

Firebase Hosting is used to host the web version of the application.

For detailed setup and deployment instructions, see [website/README.md](../website/README.md).

## Environment Configuration Management

This project supports both development and production Firebase environments. Configuration files are managed separately and can be switched using simple commands.

### Setting up environment files

1. Place your Firebase configuration files in the project root:
   ```
   # Android
   google-services.json.development
   google-services.json.production
   
   # iOS  
   GoogleService-Info.plist.development
   GoogleService-Info.plist.production
   
   # Web
   APIKeys.ts.development
   APIKeys.ts.production
   ```

2. Switch between environments:
   ```bash
   yarn firebase:dev   # Switch to development environment
   yarn firebase:prod  # Switch to production environment
   ```

   This command will automatically copy the appropriate configuration files to:
   - `android/app/google-services.json`
   - `ios/ecorismap/GoogleService-Info.plist`
   - `src/constants/APIKeys.ts`

**Important:** All environment-specific configuration files and backups are gitignored to prevent accidental commits of sensitive data.


## License
This software is released under the MIT License, see LICENSE.

_Copyright (c) 2022 ECORIS Inc._
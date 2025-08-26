# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
EcorisMap is a cross-platform field survey application (iOS, Android, Web) built with React Native + Expo that enables users to record locations and information on maps for outdoor surveys.

## Development Commands

### Essential Commands
```bash
# Install dependencies
yarn install

# Start development
yarn start          # Expo dev client
yarn ios           # iOS simulator
yarn android       # Android emulator
yarn android:device # Android physical device with emulator
yarn web           # Web version (PLATFORM=web, no sourcemap)

# Type checking & linting
npx tsc --noEmit   # TypeScript check (strict mode)
yarn lint          # ESLint with auto-fix (src/**/*.{ts,tsx})

# Testing
yarn test          # Run all tests
yarn test:coverage # With coverage report
yarn test:coverage:watch # Watch mode with coverage
yarn testemu       # Tests with Firebase emulators

# Firebase emulators (required for development)
yarn emu           # Start emulators with import/export
```

### Build Commands
```bash
yarn build:web     # Export web build
```

## Architecture Overview

### State Management
The app uses a **hybrid approach**:
- **Redux Toolkit** for global state (dataSet, layers, settings, user, projects, tileMaps, trackLog)
- **React Context** for feature-specific state (migrating from monolithic HomeContext to smaller contexts)
- **Redux Persist** for state persistence (AsyncStorage on mobile, sessionStorage on web)

### Directory Structure
```
src/
├── components/       # UI components (Atomic Design pattern)
│   ├── atoms/       # Basic elements (buttons, inputs, icons)
│   ├── molecules/   # Composite components (form fields, cards)
│   ├── organisms/   # Complex components (forms, modals, maps)
│   └── pages/       # Full pages
├── containers/      # Business logic (connects Redux/Context to components)
├── contexts/        # React Context providers (migrating from HomeContext)
├── hooks/           # Custom React hooks
├── modules/         # Redux slices (@reduxjs/toolkit)
├── utils/           # Utility functions (data processing, formatting)
├── routes/          # Navigation configuration (@react-navigation)
├── constants/       # App constants, API keys, tutorials
├── i18n/           # Internationalization config
└── types/          # TypeScript type definitions
```

### Cross-Platform Strategy
- Platform-specific files use `.web.ts` or `.web.tsx` extension
- Mobile uses React Native components, Web uses React DOM
- Separate store configurations: `store.ts` (mobile) vs `store.web.ts` (web)
- Platform-specific implementations for:
  - File handling (RNFS vs browser APIs)
  - Alerts (Alert vs sweetalert2)
  - PDF generation (expo-print vs browser print)
  - Maps (react-native-maps vs maplibre-gl)

### Data Architecture
- **GeoJSON-based** data structures for geographic features
- Support for multiple formats: GPX, KML, GeoJSON, CSV, JPEG (EXIF), SQLite3
- Layer-based organization with customizable fields and styles
- Local SQLite storage (`expo-sqlite`) with cloud sync via Firebase
- GDAL support via custom native module for advanced geospatial operations

## Security & Access Control

### Firebase Security Rules
- All operations require authenticated users with verified emails
- Role-based access control: Owner > Admin > Member
- Data permissions: PRIVATE, PUBLIC, COMMON, TEMPLATE
- File uploads limited to 20MB and specific types (PNG, JPEG, PDF, SQLite3)

### Encryption
- Virgil E3Kit for end-to-end encryption
- Encrypted project data with `encdata` and `encryptedAt` fields
- Secure key management for shared projects

## Testing Requirements

### Coverage Thresholds
- Global: 20% (branches, functions, lines, statements)
- `src/hooks/**`: 30%
- `src/utils/**`: 40%
- `src/modules/**`: 60%

### Testing Patterns
- Jest + Testing Library for unit/integration tests
- Firebase emulators for backend testing
- Extensive mocking in `jestSetupFile.js` for:
  - React Native modules
  - Firebase services
  - Navigation
  - Platform-specific APIs
- Tests located in `__tests__` directories alongside source files

## Key Technologies
- **React Native 0.79.5** + **Expo 53** (Bare Workflow)
- **TypeScript 5.8** (strict mode enabled)
- **Redux Toolkit 2.2** with Redux Persist
- **React Navigation 6** (native-stack)
- **Firebase** (Auth, Firestore, Storage, Functions)
- **React Native Maps** / **MapLibre GL 4.6** (web)
- **GDAL** via `react-native-gdalwarp` module
- **i18next** for internationalization (ja/en)
- **React Native MMKV** for fast key-value storage
- **PMTiles** for efficient map tile storage

## Firebase Functions
Located in `/functions` directory:
- `ecorismap-func.ts` - Main app functions
- `virgil-func.ts` - Encryption key management
- `generate-virgil-jwt.ts` - JWT generation for E3Kit
- Node 20 runtime
- Deploy: `npm run deploy` (from functions directory)

## Important Development Notes

1. **Context Migration**: The app is migrating from a monolithic HomeContext (86 props) to smaller, focused contexts. See `claude_docs/MIGRATION_GUIDE.md` for details.

2. **Native Module Setup**: `react-native-gdalwarp` must be downloaded and installed:
   ```bash
   # Download from GitHub releases
   # Extract to modules/react-native-gdalwarp
   ```

3. **API Keys Required**:
   - Google Maps API keys (Android/iOS) in `local.properties` and `Maps.plist`
   - MapTiler API key in `src/constants/APIKeys.ts`
   - Firebase configuration in `GoogleService-Info.plist` and `google-services.json`

4. **Type Safety**: 
   - Always run `npx tsc --noEmit` before committing
   - Strict TypeScript mode is enforced
   - No implicit any allowed

5. **Platform Testing**: 
   - Test changes on both mobile and web platforms
   - Use device-specific testing for GPS, camera features
   - Check responsive design on tablets

6. **Patch Packages**: 
   - Multiple packages are patched via `patch-package`
   - Patches in `/patches` directory
   - Applied automatically on `yarn install`

7. **Performance Considerations**:
   - Large GeoJSON files can impact performance
   - Use viewport culling for map features
   - Implement lazy loading for data lists
   - Monitor re-renders with React DevTools

8. **Emulator Ports**:
   - Auth: 9099
   - Firestore: 8080
   - Storage: 9199
   - Functions: 5001

9. **Node Version**: Requires Node.js >= 22

10. **Package Manager**: Uses Yarn 3.6.4 (specified in packageManager field)
# CLAUDE.md

日本語で返事をすること。

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
yarn web           # Web version

# Type checking & linting
yarn tsc           # TypeScript check (no emit)
yarn lint          # ESLint with auto-fix

# Testing
yarn test          # Run all tests
yarn test:coverage # With coverage report
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

### Directory Structure
```
src/
├── components/       # UI components (Atomic Design)
│   ├── atoms/       # Basic elements
│   ├── molecules/   # Composite components
│   ├── organisms/   # Complex components
│   └── pages/       # Full pages
├── containers/      # Business logic (connects to Redux/Context)
├── contexts/        # React Context providers
├── hooks/           # Custom React hooks
├── modules/         # Redux slices
├── utils/           # Utility functions
└── routes/          # Navigation configuration
```

### Cross-Platform Strategy
- Platform-specific files use `.web.ts` extension
- Separate store configurations for mobile (AsyncStorage) vs web (sessionStorage)
- Platform-specific implementations for file handling, alerts, PDF generation

### Data Architecture
- **GeoJSON-based** data structures for geographic features
- Support for multiple formats: GPX, KML, GeoJSON, CSV, etc.
- Layer-based organization with customizable fields and styles
- Local SQLite storage with cloud sync via Firebase

## Security & Access Control

### Firebase Security Rules
- All operations require authenticated users with verified emails
- Role-based access control: Owner > Admin > Member
- Data permissions: PRIVATE, PUBLIC, COMMON, TEMPLATE
- File uploads limited to 20MB and specific types (PNG, JPEG, PDF, SQLite3)

### Encryption
- Virgil E3Kit for end-to-end encryption
- Encrypted project data with `encdata` and `encryptedAt` fields

## Testing Requirements

### Coverage Thresholds
- Global: 20%
- `src/hooks/**`: 30%
- `src/utils/**`: 40%
- `src/modules/**`: 60%

### Testing Patterns
- Use Firebase emulators for integration tests
- Mock React Native, Firebase, and navigation dependencies
- Tests located in `__tests__` directories alongside source files

## Key Technologies
- **React Native + Expo** (Bare Workflow)
- **TypeScript** (strict mode)
- **Redux Toolkit** with Redux Persist
- **React Navigation**
- **Firebase** (Auth, Firestore, Storage)
- **React Native Maps** / **MapLibre GL** (web)
- **GDAL** via custom native module
- **i18next** for internationalization

## Important Notes
1. **Context Migration**: The app is migrating from HomeContext (86 props) to smaller contexts. Check MIGRATION_GUIDE.md when working with contexts.
2. **Native Module**: `react-native-gdalwarp` provides geospatial operations - check module README for usage.
3. **API Keys**: Configure MapTiler API key in `src/constants/AppConstants.tsx` from template.
4. **Type Safety**: Always run `yarn tsc` before committing - strict TypeScript mode is enforced.
5. **Platform Testing**: Test changes on both mobile and web platforms when modifying shared code.
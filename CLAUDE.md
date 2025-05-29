# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `yarn install` - Install dependencies
- `yarn start` - Start Expo dev server with dev client
- `yarn android` - Run on Android emulator
- `yarn android:device` - Run on Android device (starts Pixel 7 emulator)
- `yarn ios` - Run on iOS simulator
- `yarn web` - Run web version (GENERATE_SOURCEMAP=false)
- `yarn build:web` - Export web build

### Testing & Quality
- `yarn test` - Run all tests with flags: --detectOpenHandles --runInBand --forceExit
- `yarn test src/path/to/specific.test.ts` - Run single test file
- `yarn testemu` - Run tests with Firebase emulator
- `yarn lint` - ESLint check for .ts and .tsx files in src/
- `yarn type-check` - TypeScript type checking (tsc --noEmit)

### Firebase
- `yarn emu` - Start Firebase emulator with import/export

## Architecture Overview

### State Management
The project uses Redux Toolkit with Redux Persist. Key modules in `src/modules/`:
- `dataSet` - Geographic feature data (points, lines, polygons)
- `layers` - Layer configuration and visibility
- `settings` - App preferences and configuration
- `user` - Authentication and user profile
- `projects` - Project management and sharing
- `tileMaps` - Map tile sources and configurations
- `trackLog` - GPS tracking and route recording

Platform-specific stores: `store.ts` (mobile) vs `store.web.ts` (web) with different persistence backends.

### Component Organization
```
src/
├── components/      # UI layer (Atomic Design)
│   ├── atoms/      # Basic elements (Button, Text, Input)
│   ├── molecules/  # Composite components (CheckBox, Picker)
│   ├── organisms/  # Complex features (DataTable, MapButtons)
│   └── pages/      # Full screens (Home, Layers, Settings)
├── containers/     # Business logic and state management
├── contexts/       # React contexts for page-level state
├── hooks/          # Custom hooks for reusable logic
└── utils/          # Helper functions and utilities
```

### Platform-Specific Implementation
- Files with `.web.ts` extension contain web-specific code
- Mobile uses `react-native-maps`, web uses `maplibre-gl`
- Different implementations for: Alert, DateTime pickers, File handling, Storage
- Platform detection: `Platform.OS === 'web'`

### Data Flow Pattern
1. User interaction in Component
2. Container handles event with business logic
3. Hook orchestrates Redux actions and side effects
4. Redux module updates state
5. Selectors compute derived state
6. Components re-render with new data

### Key Integration Points
- **Firebase**: Auth, Firestore, Storage, Functions (see `src/lib/firebase/`)
- **Geospatial**: GDAL via native module (`modules/react-native-gdalwarp/`)
- **Encryption**: Virgil E3Kit for end-to-end encryption (`src/lib/virgilsecurity/`)
- **Maps**: Different providers per platform with unified interface
- **Storage**: AsyncStorage (mobile) vs sessionStorage/IndexedDB (web)

### Testing Strategy
- Unit tests for: hooks (`hooks/__tests__/`), utils, modules
- Integration tests for containers
- Firebase emulator for backend testing
- Mocked dependencies using Jest
- Test utilities in `src/__tests__/resources/`

## Important Implementation Details

### Multi-language Support
- i18n configuration in `src/i18n/`
- Supports English and Japanese
- Use `t()` function from `react-i18next` for translations

### Type Safety
- Strict TypeScript enabled
- Comprehensive types in `src/types/index.d.ts`
- Redux actions and state fully typed
- Use type guards for runtime validation

### Firebase Security
- Security rules in `firestore.rules` and `storage.rules`
- Role-based access: owner, admin, member
- Email verification required
- Project-scoped data isolation

### Performance Considerations
- Large datasets handled with pagination
- Map features rendered conditionally based on zoom
- Redux selectors memoized with reselect
- Platform-specific optimizations for file handling
# EcorisMap Development Guide

## Build/Test Commands
- Install dependencies: `yarn install`
- Start development: `yarn start` (Expo), `yarn web` (Web), `yarn ios` (iOS), `yarn android` (Android)
- Run all tests: `yarn test`
- Run a single test: `yarn test src/path/to/file.test.ts`
- Run tests with Firebase emulator: `yarn testemu`
- Lint code: `yarn lint`
- Type check: `yarn type-check`

## Code Style Guidelines
- Use TypeScript with strict mode enabled
- Follow Prettier config: 120 chars line length, 2 spaces indent, single quotes
- Use React hooks for state management (useContext, useReducer, custom hooks)
- Follow file organization: components/, hooks/, utils/, contexts/, containers/
- Naming: PascalCase for components, camelCase for functions/variables
- Testing: use @testing-library/react-hooks, jest mocks for dependencies
- Redux pattern: use selectors and dispatch with typed actions
- Error handling: proper try/catch blocks, avoid console.log (use warnings instead)
- Imports: group by 3rd party, then local modules
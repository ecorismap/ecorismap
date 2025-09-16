# Repository Guidelines

## Project Structure & Module Organization
The Expo React Native app lives in `src/`. UI code sits in `components/` and `containers/`, shared logic in `hooks/`, `utils/`, and `routes/`, and Redux setup in `store.ts` with feature slices in `src/modules/`. Assets belong in `src/assets/`. Tests default to `src/__tests__`, with fixtures co-located beside the code they verify. Custom native bridges stay in top-level `modules/`, platform projects in `android/`, `ios/`, and `web/`, and helper scripts in `scripts/`.

## Build, Test, and Development Commands
Run `yarn start` for the Metro dev client, `yarn android` or `yarn ios` to build and install native shells, and `yarn web` for the browser preview. Export static web assets with `yarn build:web`. Use `yarn lint` for ESLint + Prettier fixes, `yarn test` for Jest, and `yarn test:coverage` to emit HTML/LCOV reports in `coverage/`. Switch Firebase credentials before local runs with `yarn firebase:dev` or `yarn firebase:prod`.

## Coding Style & Naming Conventions
Code is TypeScript-first; prefer function components that compose hooks. Prettier enforces two-space indentation, single quotes, trailing commas, and a 120-character limit. ESLint (`@react-native` plus React/TypeScript plugins) warns on stray `console` usage and React Native pitfalls. Name React components in PascalCase, hooks with a `use` prefix, files that export components as `ComponentName.tsx`, and constants in `SCREAMING_SNAKE_CASE`.

## Testing Guidelines
Jest (via `jest-expo`) powers the suite. Name specs `*.test.ts` or `*.test.tsx` and keep fixtures under a nearby `__tests__/` folder. `yarn test:coverage` must meet the configured thresholds (20% global minimum, higher bars for `hooks/`, `utils/`, and `modules/`). Favor `@testing-library/react-native` for behavior-focused assertions; snapshots should stay minimal and stable.

## Commit & Pull Request Guidelines
Recent commits use concise imperative subjects, often in Japanese (e.g., `ベクタタイルがなくても低ズームレベルの情報から取得`). Mirror that tone, keep subjects under ~70 characters, and reference related issues or risks in the body. Pull requests should include a short summary, test evidence (`yarn test` output or coverage diff), any Firebase environment switches performed, and screenshots or recordings for UI changes.

## Environment & Configuration Tips
Environment-specific keys live in `APIKeys.ts.*` and `GoogleService-Info.plist.*`. Run the Firebase switch script before bundling so the correct files are symlinked. When using emulators, launch `yarn emu` and point the app to localhost via the development config. Do not commit production credentials or generated `.pkl` artifacts—they remain intentionally ignored.

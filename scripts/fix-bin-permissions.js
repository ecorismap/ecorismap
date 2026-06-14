#!/usr/bin/env node
/**
 * Yarn 3 (berry) with the node-modules linker does not always set the executable
 * bit on a package's bin target file. RN 0.85's Android autolinking executes
 * node_modules/.bin/rnc-cli directly, which fails with exit 126 (Permission denied)
 * when its target bin.js is mode 644. npm sets these to 755; we replicate that here
 * so `yarn install` produces a buildable tree.
 */
const fs = require('fs');
const path = require('path');

const targets = [
  '@react-native-community/cli/build/bin.js',
  'metro/src/cli.js',
  'metro-symbolicate/src/index.js',
  '@expo/xcpretty/build/cli.js',
];

const root = path.join(__dirname, '..', 'node_modules');

for (const rel of targets) {
  const file = path.join(root, rel);
  try {
    if (fs.existsSync(file)) {
      fs.chmodSync(file, 0o755);
    }
  } catch (e) {
    console.warn(`fix-bin-permissions: could not chmod ${rel}: ${e.message}`);
  }
}

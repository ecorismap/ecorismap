#!/usr/bin/env node

/**
 * Firebase環境設定切り替えスクリプト
 * 使用方法:
 *   yarn firebase:dev  - development環境に切り替え
 *   yarn firebase:prod - production環境に切り替え
 */

const fs = require('fs');
const path = require('path');

const env = process.argv[2];

if (!env || !['development', 'production'].includes(env)) {
  console.error('❌ 使用方法: node switch-firebase-env.js [development|production]');
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');

// 設定ファイルのパス
const configs = [
  {
    source: `google-services.json.${env}`,
    target: 'android/app/google-services.json',
    backupName: 'google-services.json.backup',
    name: 'Android'
  },
  {
    source: `GoogleService-Info.plist.${env}`,
    target: 'ios/ecorismap/GoogleService-Info.plist',
    backupName: 'GoogleService-Info.plist.backup',
    name: 'iOS'
  },
  {
    source: `APIKeys.ts.${env}`,
    target: 'src/constants/APIKeys.ts',
    backupName: 'APIKeys.ts.backup',
    name: 'Web'
  }
];

console.log(`\n🔄 Firebase設定を${env}環境に切り替えています...\n`);

let hasError = false;

configs.forEach(config => {
  const sourcePath = path.join(projectRoot, config.source);
  const targetPath = path.join(projectRoot, config.target);
  const backupPath = path.join(projectRoot, config.backupName);

  try {
    // ソースファイルの存在確認
    if (!fs.existsSync(sourcePath)) {
      console.error(`❌ ${config.name}: ソースファイルが見つかりません: ${config.source}`);
      hasError = true;
      return;
    }

    // バックアップの作成（初回のみ、プロジェクト直下に保存）
    if (!fs.existsSync(backupPath) && fs.existsSync(targetPath)) {
      fs.copyFileSync(targetPath, backupPath);
      console.log(`📦 ${config.name}: バックアップを作成しました (${config.backupName})`);
    }

    // ファイルのコピー
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✅ ${config.name}: ${env}設定に切り替えました`);
  } catch (error) {
    console.error(`❌ ${config.name}: エラーが発生しました:`, error.message);
    hasError = true;
  }
});

if (hasError) {
  console.log('\n⚠️  一部のファイルで問題が発生しました');
  process.exit(1);
} else {
  console.log('\n✨ Firebase設定の切り替えが完了しました!');
  console.log(`📱 現在の環境: ${env === 'production' ? '本番環境' : '開発環境'}\n`);
  
  if (env === 'production') {
    console.log('⚠️  注意: 本番環境の設定を使用しています。');
    console.log('    開発作業を行う場合は、yarn firebase:dev で開発環境に戻してください。\n');
  }
}
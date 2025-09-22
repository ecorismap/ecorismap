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
const keysDir = path.join(projectRoot, 'keys', env);
const templateDir = path.join(projectRoot, 'template');

// 設定ファイルのパス
const configs = [
  // Firebase設定ファイル
  {
    source: path.join(keysDir, 'google-services.json'),
    target: 'android/app/google-services.json',
    name: 'Android Firebase設定'
  },
  {
    source: path.join(keysDir, 'GoogleService-Info.plist'),
    target: 'ios/ecorismap/GoogleService-Info.plist',
    name: 'iOS Firebase設定'
  },
  // Maps API設定
  {
    source: path.join(keysDir, 'maps-key-android'),
    target: 'android/local.properties',
    template: path.join(templateDir, 'local.properties'),
    name: 'Android Maps API',
    type: 'local-properties',
    placeholder: 'YOUR-MAPS-API-KEY',
    keystoreConfig: path.join(keysDir, 'keystore-config')
  },
  {
    source: path.join(keysDir, 'maps-key-ios'),
    target: 'ios/ecorismap/Supporting/Maps.plist',
    template: path.join(templateDir, 'Maps.plist'),
    name: 'iOS Maps API',
    type: 'template',
    placeholder: 'YOUR-MAPS-API-KEY'
  },
  // Web設定 - すべてのWeb設定を一度に処理
  {
    sources: {
      firebase: path.join(keysDir, 'firebaseConfig.ts'),
      recapture: path.join(keysDir, 'reCaptureSiteKey'),
      maptiler: path.join(keysDir, 'maptilerKey')
    },
    target: 'src/constants/APIKeys.ts',
    name: 'Web設定（Firebase, reCAPTCHA, MapTiler）',
    type: 'web-config'
  }
];

console.log(`\n🔄 Firebase設定を${env}環境に切り替えています...\n`);

let hasError = false;

// keysディレクトリの存在確認
if (!fs.existsSync(keysDir)) {
  console.error(`❌ キーディレクトリが見つかりません: ${keysDir}`);
  process.exit(1);
}

configs.forEach(config => {
  const targetPath = path.join(projectRoot, config.target);

  try {
    // ソースファイルの存在確認
    if (config.type === 'web-config') {
      // Web設定の場合は複数のソースファイルをチェック
      for (const [key, sourcePath] of Object.entries(config.sources)) {
        if (!fs.existsSync(sourcePath)) {
          console.error(`❌ ${config.name}: ${key}ファイルが見つかりません: ${sourcePath}`);
          hasError = true;
          return;
        }
      }
    } else if (!fs.existsSync(config.source)) {
      console.error(`❌ ${config.name}: ソースファイルが見つかりません: ${config.source}`);
      hasError = true;
      return;
    }

    // バックアップの作成（初回のみ）
    const backupPath = targetPath + '.backup';
    if (!fs.existsSync(backupPath) && fs.existsSync(targetPath)) {
      fs.copyFileSync(targetPath, backupPath);
      console.log(`📦 ${config.name}: バックアップを作成しました`);
    }

    if (config.type === 'template') {
      // テンプレートを使用してファイルを生成
      if (!fs.existsSync(config.template)) {
        console.error(`❌ ${config.name}: テンプレートファイルが見つかりません: ${config.template}`);
        hasError = true;
        return;
      }

      const keyValue = fs.readFileSync(config.source, 'utf8').trim();
      let templateContent = fs.readFileSync(config.template, 'utf8');
      
      // プレースホルダーを実際の値に置換
      templateContent = templateContent.replace(config.placeholder, keyValue);
      
      fs.writeFileSync(targetPath, templateContent);
      console.log(`✅ ${config.name}: 設定を更新しました`);

    } else if (config.type === 'local-properties') {
      // local.properties用の特殊処理（Maps APIキー + Keystore設定）
      if (!fs.existsSync(config.template)) {
        console.error(`❌ ${config.name}: テンプレートファイルが見つかりません: ${config.template}`);
        hasError = true;
        return;
      }

      const keyValue = fs.readFileSync(config.source, 'utf8').trim();
      let content = fs.readFileSync(config.template, 'utf8');
      
      // Maps APIキーを置換
      content = content.replace(config.placeholder, keyValue);
      
      // 既存のlocal.propertiesからsdk.dirを保持
      if (fs.existsSync(targetPath)) {
        const existingContent = fs.readFileSync(targetPath, 'utf8');
        const sdkDirMatch = existingContent.match(/^sdk\.dir=.+$/m);
        if (sdkDirMatch) {
          content += `\n${sdkDirMatch[0]}`;
        }
      }
      
      // Keystore設定を追加（存在する場合）
      if (fs.existsSync(config.keystoreConfig)) {
        const keystoreConfig = fs.readFileSync(config.keystoreConfig, 'utf8').trim();
        content += `\n\n# Keystore configuration\n${keystoreConfig}`;
      }
      
      fs.writeFileSync(targetPath, content);
      console.log(`✅ ${config.name}: 設定を更新しました（Keystore設定を含む）`);

    } else if (config.type === 'web-config') {
      // Web設定の特殊処理
      const firebaseConfigContent = fs.readFileSync(config.sources.firebase, 'utf8');
      const recaptureKey = fs.readFileSync(config.sources.recapture, 'utf8').trim();
      const maptilerKey = fs.readFileSync(config.sources.maptiler, 'utf8').trim();

      // APIKeys.tsを生成
      const apiKeysContent = `// ${env === 'production' ? 'Production' : 'Development'} environment API keys
${firebaseConfigContent.trim()}
export const reCaptureSiteKey = '${recaptureKey}';
export const maptilerKey = '${maptilerKey}';
`;

      fs.writeFileSync(targetPath, apiKeysContent);
      console.log(`✅ ${config.name}: APIKeys.tsを生成しました`);

    } else {
      // 単純なファイルコピー
      fs.copyFileSync(config.source, targetPath);
      console.log(`✅ ${config.name}: ${env}設定に切り替えました`);
    }
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
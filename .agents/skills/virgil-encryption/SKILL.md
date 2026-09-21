---
name: virgil-encryption
description: Virgil E3Kitによるエンドツーエンド暗号化のベストプラクティス。E3Kit初期化、データ暗号化・復号化、グループ暗号化、鍵管理について。暗号化やE3Kitについて質問があるときに使用。
---

# Virgil E3Kit暗号化

EcorisMapにおけるVirgilセキュリティによるエンドツーエンド暗号化のベストプラクティスです。

## 概要

Virgil E3Kitは、エンドツーエンド暗号化（E2EE）を実装するためのSDKです。EcorisMapでは、プロジェクトの共有データを暗号化するために使用しています。

## アーキテクチャ

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Firebase  │────▶│   Virgil    │
│   (E3Kit)   │     │  Functions  │     │   Cloud     │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │  Firestore  │
                    │ (encdata)   │
                    └─────────────┘
```

## データ構造

### 暗号化フィールド

```typescript
interface EncryptedFeature {
  id: string;
  layerId: string;
  geometry: GeoJSON.Geometry;  // 非暗号化
  properties: Record<string, any>;  // 暗号化対象
  encdata?: string;  // 暗号化されたpropertiesのJSON
  encryptedAt?: Timestamp;  // 暗号化タイムスタンプ
}
```

### 暗号化の判定

```typescript
const isEncrypted = (feature: Feature): boolean => {
  return !!feature.encdata && !!feature.encryptedAt;
};
```

## E3Kit初期化

### JWT取得関数

```typescript
// Firebase Functionsから取得
const getVirgilJWT = async (): Promise<string> => {
  const fn = functions().httpsCallable('generateVirgilJWT');
  const result = await fn();
  return result.data.token;
};
```

### E3Kit初期化

```typescript
import { EThree } from '@anthropic/e3kit-js';

const initializeE3Kit = async (identity: string): Promise<EThree> => {
  const eThree = await EThree.initialize(getVirgilJWT);

  // ユーザー登録（初回のみ）
  try {
    await eThree.register();
  } catch (error) {
    if (error.name !== 'IdentityAlreadyExistsError') {
      throw error;
    }
    // 既に登録済みの場合は無視
  }

  return eThree;
};
```

## 暗号化操作

### データ暗号化

```typescript
const encryptData = async (
  eThree: EThree,
  data: Record<string, any>,
  recipientIds: string[]
): Promise<string> => {
  // 受信者の公開鍵を取得
  const publicKeys = await eThree.findUsers(recipientIds);

  // データをJSON文字列に変換して暗号化
  const jsonData = JSON.stringify(data);
  const encryptedData = await eThree.encrypt(jsonData, publicKeys);

  return encryptedData;
};

// 使用例
const encryptedProperties = await encryptData(
  eThree,
  feature.properties,
  projectMembers
);

const encryptedFeature = {
  ...feature,
  encdata: encryptedProperties,
  encryptedAt: serverTimestamp(),
};
```

### データ復号化

```typescript
const decryptData = async (
  eThree: EThree,
  encryptedData: string,
  senderId: string
): Promise<Record<string, any>> => {
  // 送信者の公開鍵を取得
  const senderPublicKey = await eThree.findUsers(senderId);

  // 復号化
  const decryptedJson = await eThree.decrypt(encryptedData, senderPublicKey);
  return JSON.parse(decryptedJson);
};

// 使用例
const decryptedProperties = await decryptData(
  eThree,
  feature.encdata,
  feature.createdBy
);

const decryptedFeature = {
  ...feature,
  properties: decryptedProperties,
};
```

## グループ暗号化

### グループ作成

```typescript
const createEncryptionGroup = async (
  eThree: EThree,
  groupId: string,
  memberIds: string[]
): Promise<void> => {
  const memberKeys = await eThree.findUsers(memberIds);
  await eThree.createGroup(groupId, memberKeys);
};
```

### グループでの暗号化

```typescript
const encryptForGroup = async (
  eThree: EThree,
  groupId: string,
  data: Record<string, any>
): Promise<string> => {
  const group = await eThree.getGroup(groupId);
  const encrypted = await group.encrypt(JSON.stringify(data));
  return encrypted;
};
```

### メンバー管理

```typescript
// メンバー追加
const addMember = async (
  eThree: EThree,
  groupId: string,
  newMemberId: string
): Promise<void> => {
  const group = await eThree.getGroup(groupId);
  const newMemberKey = await eThree.findUsers(newMemberId);
  await group.add(newMemberKey);
};

// メンバー削除
const removeMember = async (
  eThree: EThree,
  groupId: string,
  memberId: string
): Promise<void> => {
  const group = await eThree.getGroup(groupId);
  const memberKey = await eThree.findUsers(memberId);
  await group.remove(memberKey);
};
```

## Firebase Functions

### JWT生成関数（generate-virgil-jwt.ts）

```typescript
import * as functions from 'firebase-functions';
import { JwtGenerator } from 'virgil-sdk';
import { VirgilCrypto, VirgilAccessTokenSigner } from 'virgil-crypto';

const virgilCrypto = new VirgilCrypto();
const jwtGenerator = new JwtGenerator({
  appId: process.env.VIRGIL_APP_ID!,
  apiKeyId: process.env.VIRGIL_API_KEY_ID!,
  apiKey: virgilCrypto.importPrivateKey(process.env.VIRGIL_API_KEY!),
  accessTokenSigner: new VirgilAccessTokenSigner(virgilCrypto),
});

export const generateVirgilJWT = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', '認証が必要です');
  }

  const identity = context.auth.uid;
  const token = jwtGenerator.generateToken(identity);

  return { token: token.toString() };
});
```

## エラーハンドリング

```typescript
const handleVirgilError = (error: any): string => {
  switch (error.name) {
    case 'IdentityAlreadyExistsError':
      return 'ユーザーは既に登録されています';
    case 'UserNotFoundError':
      return 'ユーザーが見つかりません';
    case 'GroupNotFoundError':
      return 'グループが見つかりません';
    case 'PrivateKeyNoBackupError':
      return '秘密鍵のバックアップがありません';
    case 'VerificationFailedError':
      return '署名の検証に失敗しました';
    default:
      return '暗号化エラーが発生しました';
  }
};
```

## 鍵のバックアップと復元

### バックアップ

```typescript
const backupPrivateKey = async (
  eThree: EThree,
  password: string
): Promise<void> => {
  await eThree.backupPrivateKey(password);
};
```

### 復元

```typescript
const restorePrivateKey = async (
  eThree: EThree,
  password: string
): Promise<void> => {
  try {
    await eThree.restorePrivateKey(password);
  } catch (error) {
    if (error.name === 'WrongKeyknoxPasswordError') {
      throw new Error('パスワードが間違っています');
    }
    throw error;
  }
};
```

## セキュリティ考慮事項

### 必須

1. **JWTは常にサーバーサイドで生成**
   - クライアントにVirgilの秘密鍵を置かない

2. **暗号化対象の選定**
   - センシティブなpropertiesのみ暗号化
   - geometryは検索・表示のため非暗号化

3. **鍵の管理**
   - ユーザーに鍵のバックアップを促す
   - パスワードリセット時の鍵復元フロー

### 禁止

1. **秘密鍵のログ出力**
2. **暗号化されていないセンシティブデータの保存**
3. **JWTのクライアントサイド生成**

## パフォーマンス

### バッチ暗号化

```typescript
const encryptBatch = async (
  eThree: EThree,
  items: Feature[],
  recipientIds: string[]
): Promise<Feature[]> => {
  const publicKeys = await eThree.findUsers(recipientIds);

  return Promise.all(
    items.map(async item => ({
      ...item,
      encdata: await eThree.encrypt(
        JSON.stringify(item.properties),
        publicKeys
      ),
      encryptedAt: new Date(),
    }))
  );
};
```

### キャッシュ

```typescript
// 公開鍵のキャッシュ
const publicKeyCache = new Map<string, any>();

const getCachedPublicKey = async (
  eThree: EThree,
  userId: string
): Promise<any> => {
  if (publicKeyCache.has(userId)) {
    return publicKeyCache.get(userId);
  }

  const key = await eThree.findUsers(userId);
  publicKeyCache.set(userId, key);
  return key;
};
```

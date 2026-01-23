---
name: firebase-patterns
description: Firebase開発のベストプラクティス。Authentication、Firestore、Storage、Cloud Functions、Security Rulesについて。Firebaseの実装やセキュリティルールについて質問があるときに使用。
---

# Firebase パターン

EcorisMapにおけるFirebase（Authentication, Firestore, Storage, Functions）のベストプラクティスです。

## Firebase Authentication

### 認証フロー

```typescript
import auth from '@react-native-firebase/auth';

// メール/パスワード認証
const signInWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await auth().signInWithEmailAndPassword(email, password);

    // メール確認チェック
    if (!userCredential.user.emailVerified) {
      throw new Error('メールアドレスが確認されていません');
    }

    return userCredential.user;
  } catch (error) {
    handleAuthError(error);
  }
};

// 認証状態の監視
useEffect(() => {
  const unsubscribe = auth().onAuthStateChanged(user => {
    if (user && user.emailVerified) {
      setUser(user);
    } else {
      setUser(null);
    }
  });

  return unsubscribe;
}, []);
```

### エラーハンドリング

```typescript
const handleAuthError = (error: any) => {
  switch (error.code) {
    case 'auth/user-not-found':
      return 'ユーザーが見つかりません';
    case 'auth/wrong-password':
      return 'パスワードが間違っています';
    case 'auth/email-already-in-use':
      return 'このメールアドレスは既に使用されています';
    case 'auth/weak-password':
      return 'パスワードが弱すぎます';
    default:
      return '認証エラーが発生しました';
  }
};
```

## Firestore

### データ構造

```typescript
// コレクション構造
// users/{userId}
// projects/{projectId}
// projects/{projectId}/layers/{layerId}
// projects/{projectId}/features/{featureId}

interface Project {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
  permission: 'PRIVATE' | 'PUBLIC' | 'COMMON' | 'TEMPLATE';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Feature {
  id: string;
  layerId: string;
  geometry: GeoJSON.Geometry;
  properties: Record<string, any>;
  encdata?: string;      // 暗号化データ
  encryptedAt?: Timestamp;
}
```

### CRUD操作

```typescript
import firestore from '@react-native-firebase/firestore';

// 作成
const createProject = async (project: Omit<Project, 'id'>) => {
  const ref = firestore().collection('projects').doc();
  await ref.set({
    ...project,
    id: ref.id,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
};

// 読み取り
const getProject = async (projectId: string) => {
  const doc = await firestore().collection('projects').doc(projectId).get();
  return doc.exists ? doc.data() as Project : null;
};

// 更新
const updateProject = async (projectId: string, data: Partial<Project>) => {
  await firestore().collection('projects').doc(projectId).update({
    ...data,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
};

// 削除
const deleteProject = async (projectId: string) => {
  await firestore().collection('projects').doc(projectId).delete();
};
```

### リアルタイム監視

```typescript
// ドキュメント監視
useEffect(() => {
  const unsubscribe = firestore()
    .collection('projects')
    .doc(projectId)
    .onSnapshot(doc => {
      if (doc.exists) {
        setProject(doc.data() as Project);
      }
    });

  return unsubscribe;
}, [projectId]);

// クエリ監視
useEffect(() => {
  const unsubscribe = firestore()
    .collection('projects')
    .where('members', 'array-contains', userId)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(snapshot => {
      const projects = snapshot.docs.map(doc => doc.data() as Project);
      setProjects(projects);
    });

  return unsubscribe;
}, [userId]);
```

### バッチ操作

```typescript
const batchUpdate = async (features: Feature[]) => {
  const batch = firestore().batch();

  features.forEach(feature => {
    const ref = firestore().collection('features').doc(feature.id);
    batch.update(ref, {
      ...feature,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
};
```

## Security Rules

### 基本ルール

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 認証済みユーザーのみ
    function isAuthenticated() {
      return request.auth != null && request.auth.token.email_verified == true;
    }

    // ドキュメント所有者チェック
    function isOwner(userId) {
      return request.auth.uid == userId;
    }

    // プロジェクトメンバーチェック
    function isMember(projectId) {
      let project = get(/databases/$(database)/documents/projects/$(projectId)).data;
      return request.auth.uid in project.members;
    }

    // プロジェクト
    match /projects/{projectId} {
      allow read: if isAuthenticated() && (
        resource.data.permission == 'PUBLIC' ||
        resource.data.permission == 'TEMPLATE' ||
        isMember(projectId)
      );
      allow create: if isAuthenticated();
      allow update, delete: if isAuthenticated() && isOwner(resource.data.ownerId);
    }
  }
}
```

### ロールベースアクセス

```javascript
// ロール定義
function getRole(projectId) {
  let project = get(/databases/$(database)/documents/projects/$(projectId)).data;
  return project.roles[request.auth.uid];
}

function isOwnerRole(projectId) {
  return getRole(projectId) == 'owner';
}

function isAdminRole(projectId) {
  return getRole(projectId) in ['owner', 'admin'];
}

function isMemberRole(projectId) {
  return getRole(projectId) in ['owner', 'admin', 'member'];
}
```

## Storage

### ファイルアップロード

```typescript
import storage from '@react-native-firebase/storage';

const uploadFile = async (
  filePath: string,
  storagePath: string,
  onProgress?: (progress: number) => void
) => {
  const reference = storage().ref(storagePath);
  const task = reference.putFile(filePath);

  if (onProgress) {
    task.on('state_changed', snapshot => {
      const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      onProgress(progress);
    });
  }

  await task;
  return reference.getDownloadURL();
};
```

### Storage Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /projects/{projectId}/{allPaths=**} {
      // 20MB制限
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.resource.size < 20 * 1024 * 1024
        && request.resource.contentType.matches('image/.*|application/pdf|application/x-sqlite3');
    }
  }
}
```

## Cloud Functions

### 呼び出し

```typescript
import functions from '@react-native-firebase/functions';

const callFunction = async (name: string, data: any) => {
  const fn = functions().httpsCallable(name);
  const result = await fn(data);
  return result.data;
};

// 使用例
const result = await callFunction('processData', { projectId: 'abc123' });
```

### エミュレータ接続

```typescript
if (__DEV__) {
  auth().useEmulator('http://localhost:9099');
  firestore().useEmulator('localhost', 8080);
  storage().useEmulator('localhost', 9199);
  functions().useEmulator('localhost', 5001);
}
```

## オフライン対応

### Firestoreキャッシュ

```typescript
// オフラインの永続化を有効化
await firestore().settings({
  persistence: true,
  cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
});

// キャッシュから読み取り
const getCachedData = async (path: string) => {
  try {
    const doc = await firestore().doc(path).get({ source: 'cache' });
    return doc.data();
  } catch {
    // キャッシュにない場合はサーバーから
    const doc = await firestore().doc(path).get({ source: 'server' });
    return doc.data();
  }
};
```

## エラーハンドリング

```typescript
const handleFirestoreError = (error: any) => {
  switch (error.code) {
    case 'permission-denied':
      return 'アクセス権限がありません';
    case 'not-found':
      return 'データが見つかりません';
    case 'already-exists':
      return 'データが既に存在します';
    case 'unavailable':
      return 'サービスが一時的に利用できません';
    default:
      return 'エラーが発生しました';
  }
};
```

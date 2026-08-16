import { ENABLE_KEY_LEDGER, FUNC_ENCRYPTION } from '../../constants/AppConstants';
import * as e3kit from '../virgilsecurity/e3kit';
import { authEncryptWithKeys, authDecryptWithKeys } from './identity';
import { loadIdentityPrivateKey } from './keyStorage';
import {
  clearPublicKeyLedgerCache,
  getPublicKeyFromLedger,
  getPublicKeyHistoryFromLedger,
} from '../firebase/publicKeys';
import { auth } from '../firebase/firebase';

/**
 * DEKラップ/アンラップのファサード（脱Virgil移行の窓口）。
 *
 * ENABLE_KEY_LEDGER が true のとき、公開鍵の取得を Firestore の公開鍵台帳(publicKeys/{uid})
 * 優先で行い、台帳に無い・失敗した場合は従来の e3kit(Virgil Cards) へフォールバックする。
 * false のときは常に e3kit を使う（挙動不変）。
 *
 * ラップ形式は e3kit の authEncrypt と完全互換（identity.ts 参照）なので、
 * どちらの経路で作ったラップも新旧アプリの双方で開封できる。
 */

export { clearPublicKeyLedgerCache };

/** 自分の識別秘密鍵を取得する。新ストレージ → （未移行時）e3kitのローカル鍵の順で探す。 */
const loadMyIdentityPrivateKey = async (uid: string): Promise<string | undefined> => {
  const stored = await loadIdentityPrivateKey(uid);
  if (stored !== undefined) return stored;
  const exported = await e3kit.exportLocalIdentityKey(uid);
  return exported?.privateKey;
};

/**
 * DEK秘密鍵を指定メンバーの公開鍵でラップする（e3kit.wrapDEKForMember の後継）。
 * @returns ラップ済み文字列（base64）。失敗時は throw（呼び出し元の catch で処理）。
 */
export const wrapDEKForMember = async (dekPrivateKeyB64: string, memberUid: string): Promise<string> => {
  if (ENABLE_KEY_LEDGER && FUNC_ENCRYPTION) {
    try {
      const myUid = auth?.currentUser?.uid;
      if (myUid) {
        const [myPrivateKey, recipient] = await Promise.all([
          loadMyIdentityPrivateKey(myUid),
          getPublicKeyFromLedger(memberUid),
        ]);
        if (myPrivateKey !== undefined && recipient !== undefined) {
          return await authEncryptWithKeys(dekPrivateKeyB64, myPrivateKey, recipient.publicKey);
        }
      }
    } catch (e) {
      console.log('[wrapDEKForMember] ledger path failed, falling back to e3kit', e);
    }
  }
  return e3kit.wrapDEKForMember(dekPrivateKeyB64, memberUid);
};

/**
 * 自分宛てにラップされた DEK 秘密鍵を開封する（e3kit.unwrapDEK の後継）。
 * ラッパーが鍵ローテーションしていた場合は台帳の旧世代(history)で署名検証をリトライする。
 * @returns DEK 秘密鍵（base64）。開封できない場合は undefined。
 */
export const unwrapDEK = async (
  wrapped: string,
  wrapperUid: string,
  encryptedAt?: Date
): Promise<string | undefined> => {
  if (ENABLE_KEY_LEDGER && FUNC_ENCRYPTION) {
    try {
      const myUid = auth?.currentUser?.uid;
      if (myUid) {
        const [myPrivateKey, wrapper] = await Promise.all([
          loadMyIdentityPrivateKey(myUid),
          getPublicKeyFromLedger(wrapperUid),
        ]);
        if (myPrivateKey !== undefined && wrapper !== undefined) {
          try {
            return await authDecryptWithKeys(wrapped, myPrivateKey, [wrapper.publicKey]);
          } catch (e) {
            // 現行鍵で署名検証に失敗: ローテーション前のラップの可能性があるため旧世代でリトライ
            const history = await getPublicKeyHistoryFromLedger(wrapperUid);
            if (history.length > 0) {
              try {
                return await authDecryptWithKeys(wrapped, myPrivateKey, history);
              } catch (retryError) {
                console.log('[unwrapDEK] history retry failed', retryError);
              }
            }
            console.log('[unwrapDEK] ledger path failed, falling back to e3kit', e);
          }
        }
      }
    } catch (e) {
      console.log('[unwrapDEK] ledger path error, falling back to e3kit', e);
    }
  }
  return e3kit.unwrapDEK(wrapped, wrapperUid, encryptedAt);
};

import { useCallback } from 'react';
import { ResetEncryptKeyConfirmAsync } from '../components/molecules/AlertAsync';
import { auth } from '../lib/firebase/firebase';
import { countProjectsAffectedByKeyReset } from '../lib/firebase/firestore';
import { t } from '../i18n/config';

/** 影響件数から警告文を組み立てる（件数が取れなかったときは一般的な説明にする）。 */
export const buildKeyResetWarning = (counts: { shared: number; solo: number } | undefined) => {
  const lines = [t('Account.resetWarning.intro')];
  if (counts === undefined) {
    lines.push(t('Account.resetWarning.sharedUnknown'), t('Account.resetWarning.soloUnknown'));
  } else {
    if (counts.shared > 0) lines.push(t('Account.resetWarning.shared', { num: counts.shared }));
    if (counts.solo > 0) lines.push(t('Account.resetWarning.solo', { num: counts.solo }));
  }
  lines.push(t('Account.resetWarning.retry'));
  return lines.join('\n\n');
};

/**
 * 暗号化キーをリセットする前の確認。PINを忘れた人が通常のパスワード再設定と同じ感覚で
 * リセットしないよう、開けなくなるプロジェクトの件数と、復旧できないプロジェクトの有無を示す。
 */
export const useEncryptKeyResetConfirm = () => {
  return useCallback(async () => {
    let counts: { shared: number; solo: number } | undefined;
    const uid = auth?.currentUser?.uid;
    if (uid) {
      try {
        counts = await countProjectsAffectedByKeyReset(uid);
      } catch {
        // 件数が取れなくても警告は出す（buildKeyResetWarning が一般的な説明にする）
      }
    }
    return ResetEncryptKeyConfirmAsync(buildKeyResetWarning(counts));
  }, []);
};

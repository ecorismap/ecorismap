import { t } from '../i18n/config';

/**
 * レイヤ保存前の確認文。クラウド未移行と値の消失の両方に当たるときは1つにまとめる。
 * 同じ形式変更について2回続けて答えさせないため（作図監査 E-M4 のレビュー指摘）
 */
export const getLayerSaveConfirmMessage = (
  unmigratedCloudFieldNames: string[],
  lostFieldValueCount: number
): string | undefined => {
  const fields = unmigratedCloudFieldNames.join(', ');
  if (unmigratedCloudFieldNames.length > 0 && lostFieldValueCount > 0) {
    return t('LayerEdit.confirm.unmigratedAndLostFieldValues', { fields, count: lostFieldValueCount });
  }
  if (unmigratedCloudFieldNames.length > 0) return t('LayerEdit.confirm.unmigratedCloudFields', { fields });
  if (lostFieldValueCount > 0) return t('LayerEdit.confirm.lostFieldValues', { count: lostFieldValueCount });
  return undefined;
};

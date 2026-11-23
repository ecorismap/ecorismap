import { getLayerSaveConfirmMessage } from '../layerSaveConfirm';
import { t } from '../../i18n/config';

//レイヤ保存前の確認は1回の保存で1回だけ出す（作図監査 E-M4 のレビュー指摘）
describe('getLayerSaveConfirmMessage', () => {
  it('どちらにも当たらなければ確認しない', () => {
    expect(getLayerSaveConfirmMessage([], 0)).toBeUndefined();
  });

  it('片方だけなら従来の文言', () => {
    expect(getLayerSaveConfirmMessage(['a', 'b'], 0)).toBe(
      t('LayerEdit.confirm.unmigratedCloudFields', { fields: 'a, b' })
    );
    expect(getLayerSaveConfirmMessage([], 3)).toBe(t('LayerEdit.confirm.lostFieldValues', { count: 3 }));
  });

  it('両方に当たれば1つの文言にまとめる', () => {
    const message = getLayerSaveConfirmMessage(['a'], 2);
    expect(message).toBe(t('LayerEdit.confirm.unmigratedAndLostFieldValues', { fields: 'a', count: 2 }));
    expect(message).not.toBe(t('LayerEdit.confirm.unmigratedCloudFields', { fields: 'a' }));
  });
});

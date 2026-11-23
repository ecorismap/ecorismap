import { LayerType } from '../../types';
import { isReferenceAddLocked } from '../referenceLock';

//参照欄からの追加を一覧と同じロックで止める（docs/DECISIONS_2026-11.md E-M3）

const layer = (id: string, permission: LayerType['permission']): LayerType => ({
  id,
  name: id,
  type: 'NONE',
  permission,
  colorStyle: {
    colorType: 'SINGLE',
    color: '#ff0000',
    fieldName: '',
    colorRamp: 'RANDOM',
    customFieldValue: '',
    colorList: [],
    transparency: 0.2,
  },
  label: '',
  visible: true,
  active: false,
  field: [],
});

describe('isReferenceAddLocked', () => {
  it('実行中プロジェクトのCOMMONは止める', () => {
    const ref = layer('ref', 'COMMON');
    expect(isReferenceAddLocked(ref, [ref], true)).toBe(true);
  });

  it('PRIVATE・PUBLICや、実行中でない（個人・設定中）ときは止めない', () => {
    expect(isReferenceAddLocked(layer('a', 'PRIVATE'), [], true)).toBe(false);
    expect(isReferenceAddLocked(layer('b', 'PUBLIC'), [], true)).toBe(false);
    const common = layer('c', 'COMMON');
    expect(isReferenceAddLocked(common, [common], false)).toBe(false);
  });

  it('画面のレイヤが古くても、最新のlayersの権限で判定する', () => {
    const stale = layer('ref', 'PRIVATE');
    const latest = layer('ref', 'COMMON');
    expect(isReferenceAddLocked(stale, [latest], true)).toBe(true);
    expect(isReferenceAddLocked(latest, [stale], true)).toBe(false);
  });
});

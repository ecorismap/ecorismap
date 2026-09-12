import { useSelector } from 'react-redux';
import { useFeatureFlags } from '../useFeatureFlags';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

const mockUseSelector = useSelector as unknown as jest.Mock;

describe('useFeatureFlags', () => {
  it('組織アカウントにログイン中は全フラグが有効', () => {
    mockUseSelector.mockImplementation((selector) => selector({ user: { uid: 'uid1' } }));
    const flags = useFeatureFlags();
    expect(flags.hisyouTool).toBe(true);
    expect(flags.mapPresets).toBe(true);
    expect(flags.layerPresets).toBe(true);
  });

  it('未ログイン（Drive接続のみ含む）でも地図プリセットと飛翔図は有効、レイヤプリセットは無効', () => {
    mockUseSelector.mockImplementation((selector) => selector({ user: { uid: undefined } }));
    const flags = useFeatureFlags();
    expect(flags.hisyouTool).toBe(true);
    expect(flags.mapPresets).toBe(true);
    expect(flags.layerPresets).toBe(false);
  });
});

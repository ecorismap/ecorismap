import { useSelector } from 'react-redux';
import { useFeatureFlags } from '../useFeatureFlags';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

const mockUseSelector = useSelector as unknown as jest.Mock;

describe('useFeatureFlags', () => {
  it('組織アカウントにログイン中はhisyouToolとmapLayerPresetsが有効', () => {
    mockUseSelector.mockImplementation((selector) => selector({ user: { uid: 'uid1' } }));
    const flags = useFeatureFlags();
    expect(flags.hisyouTool).toBe(true);
    expect(flags.mapLayerPresets).toBe(true);
  });

  it('未ログイン（Drive接続のみ含む）はhisyouToolとmapLayerPresetsが無効', () => {
    mockUseSelector.mockImplementation((selector) => selector({ user: { uid: undefined } }));
    const flags = useFeatureFlags();
    expect(flags.hisyouTool).toBe(false);
    expect(flags.mapLayerPresets).toBe(false);
  });
});

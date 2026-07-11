import { useSelector } from 'react-redux';
import { useFeatureFlags } from '../useFeatureFlags';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

const mockUseSelector = useSelector as unknown as jest.Mock;

describe('useFeatureFlags', () => {
  it('組織アカウントにログイン中はhisyouToolが有効', () => {
    mockUseSelector.mockImplementation((selector) => selector({ user: { uid: 'uid1' } }));
    expect(useFeatureFlags().hisyouTool).toBe(true);
  });

  it('未ログイン（Drive接続のみ含む）はhisyouToolが無効', () => {
    mockUseSelector.mockImplementation((selector) => selector({ user: { uid: undefined } }));
    expect(useFeatureFlags().hisyouTool).toBe(false);
  });
});

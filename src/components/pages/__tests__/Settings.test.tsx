import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import Settings from '../Settings';
import { SettingsContext } from '../../../contexts/Settings';

// 設定監査 S-L6: Web では精度の設定が効かないので、GPS設定の入口を出さない

jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'View',
}));
jest.mock('../../molecules/BottomSheetHeader', () => ({ BottomSheetHeader: () => null }));
jest.mock('../../molecules/Loading', () => ({ Loading: () => null }));

const renderSettings = async () =>
  await render(
    <SettingsContext.Provider
      value={new Proxy({ isLoading: false }, { get: (target, key) => (key in target ? (target as Record<string, unknown>)[key as string] : jest.fn()) }) as React.ContextType<typeof SettingsContext>}
    >
      <Settings />
    </SettingsContext.Provider>
  );

describe('Settings の GPS設定ボタン', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('ネイティブでは表示する', async () => {
    Platform.OS = 'ios';
    const { queryByText } = await renderSettings();
    expect(queryByText('Settings.gps_settings.text')).not.toBeNull();
  });

  it('Web では表示しない（言語・キャッシュなど他の設定は出す）', async () => {
    Platform.OS = 'web';
    const { queryByText } = await renderSettings();
    expect(queryByText('Settings.gps_settings.text')).toBeNull();
    expect(queryByText('Settings.language.text')).not.toBeNull();
  });
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HomeCompassButton } from '../HomeCompassButton';

// @expo/vector-iconsのモック
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'View',
}));

describe('HomeCompassButton', () => {
  const renderButton = async (handlers: { press: () => void; longPress: () => void }) =>
    await render(
      <HomeCompassButton
        azimuth={0}
        headingUp={false}
        onPressCompass={handlers.press}
        onLongPressCompass={handlers.longPress}
      />
    );

  it('短押しでコンパスモードの切り替えを呼ぶ', async () => {
    const press = jest.fn();
    const longPress = jest.fn();
    const { getByText } = await renderButton({ press, longPress });

    fireEvent.press(getByText('N'));

    expect(press).toHaveBeenCalledTimes(1);
    expect(longPress).not.toHaveBeenCalled();
  });

  it('長押しで方角線の表示を切り替える', async () => {
    const press = jest.fn();
    const longPress = jest.fn();
    const { getByText } = await renderButton({ press, longPress });

    fireEvent(getByText('N'), 'longPress');

    expect(longPress).toHaveBeenCalledTimes(1);
    expect(press).not.toHaveBeenCalled();
  });
});

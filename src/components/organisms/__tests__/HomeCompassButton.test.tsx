import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HomeCompassButton } from '../HomeCompassButton';
import { COLOR } from '../../../constants/AppConstants';

// @expo/vector-iconsのモック
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'View',
}));

describe('HomeCompassButton', () => {
  const renderButton = async (showDirectionLine: boolean, handlers: { press: () => void; longPress: () => void }) =>
    await render(
      <HomeCompassButton
        azimuth={0}
        headingUp={false}
        showDirectionLine={showDirectionLine}
        onPressCompass={handlers.press}
        onLongPressCompass={handlers.longPress}
      />
    );

  it('短押しでコンパスモードの切り替えを呼ぶ', async () => {
    const press = jest.fn();
    const longPress = jest.fn();
    const { getByText } = await renderButton(false, { press, longPress });

    fireEvent.press(getByText('N'));

    expect(press).toHaveBeenCalledTimes(1);
    expect(longPress).not.toHaveBeenCalled();
  });

  it('長押しで方角線の表示を切り替える', async () => {
    const press = jest.fn();
    const longPress = jest.fn();
    const { getByText } = await renderButton(false, { press, longPress });

    fireEvent(getByText('N'), 'longPress');

    expect(longPress).toHaveBeenCalledTimes(1);
    expect(press).not.toHaveBeenCalled();
  });

  it('方角線ONのときは背景色で状態を示す（showDirectionLineの変化が反映される）', async () => {
    const handlers = { press: jest.fn(), longPress: jest.fn() };
    const off = await renderButton(false, handlers);
    expect(off.getByText('N').parent).toHaveStyle({ backgroundColor: COLOR.ALFAWHITE });

    const on = await renderButton(true, handlers);
    expect(on.getByText('N').parent).toHaveStyle({ backgroundColor: COLOR.ALFAORANGE });
  });
});

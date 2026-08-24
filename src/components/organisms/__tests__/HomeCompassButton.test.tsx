import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HomeCompassButton } from '../HomeCompassButton';

describe('HomeCompassButton', () => {
  const renderButton = async (
    handlers: { press: () => void; longPress: () => void },
    { azimuth = 0, headingUp = false }: { azimuth?: number; headingUp?: boolean } = {}
  ) =>
    await render(
      <HomeCompassButton
        azimuth={azimuth}
        headingUp={headingUp}
        onPressCompass={handlers.press}
        onLongPressCompass={handlers.longPress}
      />
    );

  it('短押しでコンパスモードの切り替えを呼ぶ', async () => {
    const press = jest.fn();
    const longPress = jest.fn();
    const { getByTestId } = await renderButton({ press, longPress });

    fireEvent.press(getByTestId('home-compass-button'));

    expect(press).toHaveBeenCalledTimes(1);
    expect(longPress).not.toHaveBeenCalled();
  });

  it('長押しで方角線の表示を切り替える', async () => {
    const press = jest.fn();
    const longPress = jest.fn();
    const { getByTestId } = await renderButton({ press, longPress });

    fireEvent(getByTestId('home-compass-button'), 'longPress');

    expect(longPress).toHaveBeenCalledTimes(1);
    expect(press).not.toHaveBeenCalled();
  });

  it('ノースアップ時も方位盤が端末の向きに追従して回転する', async () => {
    const press = jest.fn();
    const longPress = jest.fn();
    const { getByTestId } = await renderButton({ press, longPress }, { azimuth: 90, headingUp: false });

    const rotator = getByTestId('compass-rose-rotator');
    expect(rotator.props.style).toEqual(expect.objectContaining({ transform: [{ rotate: '270deg' }] }));
  });

  it('ヘディングアップ時はリングが太くなる（モードの視覚的区別）', async () => {
    const press = jest.fn();
    const longPress = jest.fn();
    const { getByTestId } = await renderButton({ press, longPress }, { headingUp: true });

    expect(getByTestId('compass-ring').props.strokeWidth).toBe(2);
  });

  it('ノースアップ時はリングが細い', async () => {
    const press = jest.fn();
    const longPress = jest.fn();
    const { getByTestId } = await renderButton({ press, longPress }, { headingUp: false });

    expect(getByTestId('compass-ring').props.strokeWidth).toBe(1);
  });
});

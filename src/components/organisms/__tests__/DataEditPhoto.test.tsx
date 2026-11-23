/**
 * 写真の取り込み（撮影・選択と保存）の実行中は、撮影・選択ボタンを無効にする（写真監査 P-L3 / 実機確認 PHOTO-10）。
 * 押せる見た目のまま押すとカメラが起動して見え、重ねた取り込みの取り違えを疑わせる
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DataEditPhoto } from '../DataEditPhoto';
import { DataEditContext } from '../../../contexts/DataEdit';
import { RecordType } from '../../../types';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'View' }));

type ContextValue = React.ComponentProps<typeof DataEditContext.Provider>['value'];

const data = { id: 'R1', field: { 写真: [] } } as unknown as RecordType;

const renderPhoto = async (isPhotoProcessing: boolean | undefined) => {
  const pressTakePhoto = jest.fn();
  const pressPickPhoto = jest.fn();
  const value = {
    data,
    isPhotoProcessing,
    pressPhoto: jest.fn(),
    pressTakePhoto,
    pressPickPhoto,
  } as unknown as ContextValue;
  const screen = await render(
    <DataEditContext.Provider value={value}>
      <DataEditPhoto fieldName="写真" />
    </DataEditContext.Provider>
  );
  return { screen, pressTakePhoto, pressPickPhoto };
};

describe('DataEditPhoto', () => {
  it('取り込みの実行中は、撮影・選択ボタンが無効で、押しても何も呼ばない', async () => {
    const { screen, pressTakePhoto, pressPickPhoto } = await renderPhoto(true);
    const camera = screen.getByTestId('dataedit-photo-camera');
    const library = screen.getByTestId('dataedit-photo-library');
    expect(camera.props.accessibilityState?.disabled ?? camera.props['aria-disabled']).toBe(true);
    expect(library.props.accessibilityState?.disabled ?? library.props['aria-disabled']).toBe(true);
    await fireEvent.press(camera);
    await fireEvent.press(library);
    expect(pressTakePhoto).not.toHaveBeenCalled();
    expect(pressPickPhoto).not.toHaveBeenCalled();
  });

  it('実行中でなければ、撮影・選択を呼ぶ', async () => {
    const { screen, pressTakePhoto, pressPickPhoto } = await renderPhoto(false);
    await fireEvent.press(screen.getByTestId('dataedit-photo-camera'));
    await fireEvent.press(screen.getByTestId('dataedit-photo-library'));
    expect(pressTakePhoto).toHaveBeenCalledWith('写真');
    expect(pressPickPhoto).toHaveBeenCalledWith('写真');
  });
});

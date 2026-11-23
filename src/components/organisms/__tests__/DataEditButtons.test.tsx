/**
 * 写真の取り込み中は、記録を離れる・消す・複製するボタンを止める（写真監査 P-L3 / 実機確認 PHOTO-10）。
 * 取り込んだ写真は付け先の記録が変わると捨てられるので、押せると選んだ写真が黙って消える。
 * 地図アプリを開くだけの Maps は記録に触れないので押せたままにする
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DataEditButtons } from '../DataEditButtons';
import { DataEditContext } from '../../../contexts/DataEdit';
import { LayerType } from '../../../types';
import { t } from '../../../i18n/config';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'View' }));

type ContextValue = React.ComponentProps<typeof DataEditContext.Provider>['value'];

const renderButtons = async (isPhotoProcessing: boolean) => {
  const handlers = {
    pressCopyData: jest.fn(),
    pressDeleteData: jest.fn(),
    pressJumpToData: jest.fn(),
    gotoGoogleMaps: jest.fn(),
    pressEditPosition: jest.fn(),
  };
  const value = {
    layer: { id: 'L1', type: 'POINT' } as LayerType,
    isEditingRecord: false,
    isPhotoProcessing,
    isEditable: true,
    modifyBlockMessage: undefined,
    deleteBlockMessage: undefined,
    ...handlers,
  } as unknown as ContextValue;
  const screen = await render(
    <DataEditContext.Provider value={value}>
      <DataEditButtons />
    </DataEditContext.Provider>
  );
  const pressAll = async () => {
    for (const key of ['jump', 'google', 'edit', 'copy', 'delete']) {
      await fireEvent.press(screen.getByText(t(`DataEdit.label.${key}`)));
    }
  };
  return { handlers, pressAll };
};

describe('DataEditButtons', () => {
  it('写真の取り込み中は、表示・位置・複製・削除を押しても呼ばず、Mapsは呼ぶ', async () => {
    const { handlers, pressAll } = await renderButtons(true);
    await pressAll();
    expect(handlers.pressJumpToData).not.toHaveBeenCalled();
    expect(handlers.pressEditPosition).not.toHaveBeenCalled();
    expect(handlers.pressCopyData).not.toHaveBeenCalled();
    expect(handlers.pressDeleteData).not.toHaveBeenCalled();
    expect(handlers.gotoGoogleMaps).toHaveBeenCalledTimes(1);
  });

  it('取り込み中でなければ、すべて呼ぶ', async () => {
    const { handlers, pressAll } = await renderButtons(false);
    await pressAll();
    expect(handlers.pressJumpToData).toHaveBeenCalledTimes(1);
    expect(handlers.pressEditPosition).toHaveBeenCalledTimes(1);
    expect(handlers.pressCopyData).toHaveBeenCalledTimes(1);
    expect(handlers.pressDeleteData).toHaveBeenCalledTimes(1);
    expect(handlers.gotoGoogleMaps).toHaveBeenCalledTimes(1);
  });
});

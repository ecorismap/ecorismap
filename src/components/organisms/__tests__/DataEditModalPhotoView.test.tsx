/**
 * 写真ビューアで削除の確認ダイアログをキャンセルしたあと、見えている写真と削除の対象がずれない（写真監査 P-M14）。
 * ダイアログの間はModalが引っ込み、ImageViewerがアンマウントされる。戻ったときは、開いた時点の位置ではなく
 * いま選んでいる（スワイプ先の）写真の位置で作り直す
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { DataEditModalPhotoView } from '../DataEditModalPhotoView';
import { DataEditContext } from '../../../contexts/DataEdit';
import { PhotoType, RecordType, SelectedPhotoType } from '../../../types';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'View' }));

let mockShown = true;
jest.mock('../../molecules/StyledDialog', () => ({
  useModalYieldingToDialog: () => mockShown,
}));

jest.mock('../../../utils/Photo', () => ({ hasLocalPhotoFile: jest.fn(async () => true) }));

// ImageViewerは、マウントごとに最初に受け取ったindexを記録する（実物もマウント時のindexで表示する）
const mockMounts: number[] = [];
let mockOnChange: ((position?: number) => void) | undefined;
jest.mock('react-native-image-zoom-viewer', () => {
  const ReactActual = jest.requireActual('react');
  const MockViewer = (props: { index: number; onChange: (position?: number) => void }) => {
    mockOnChange = props.onChange;
    ReactActual.useEffect(() => {
      mockMounts.push(props.index);
    }, []);
    return null;
  };
  return { __esModule: true, default: MockViewer };
});

type ContextValue = React.ComponentProps<typeof DataEditContext.Provider>['value'];

const p = (id: string): PhotoType => ({
  id,
  name: `${id}.jpg`,
  uri: `file:///photos/${id}.jpg`,
  url: null,
  key: null,
  width: 10,
  height: 10,
  thumbnail: null,
});
const photos = [p('A'), p('B'), p('C')];
const data = { id: 'R1', field: { 写真: photos } } as unknown as RecordType;
const selected = (index: number): SelectedPhotoType => ({ ...photos[index], index, fieldName: '写真', hasLocal: true });

const value = (index: number, swipePhoto = jest.fn()): ContextValue =>
  ({
    data,
    photo: selected(index),
    isPhotoViewOpen: true,
    pressClosePhoto: jest.fn(),
    pressRemovePhoto: jest.fn(),
    pressDownloadPhoto: jest.fn(),
    swipePhoto,
  }) as unknown as ContextValue;

const view = (v: ContextValue) => (
  <DataEditContext.Provider value={v}>
    <DataEditModalPhotoView />
  </DataEditContext.Provider>
);

describe('DataEditModalPhotoView 削除確認のキャンセル後の表示位置', () => {
  beforeEach(() => {
    mockShown = true;
    mockMounts.length = 0;
    mockOnChange = undefined;
  });

  it('スワイプ先の写真のまま戻り、ヘッダーの番号とも一致する', async () => {
    const swipePhoto = jest.fn();
    const screen = await render(view(value(0, swipePhoto)));
    await act(async () => {});
    expect(mockMounts).toEqual([0]);

    // Cへスワイプ（DataEditが選択中の写真をCにする）
    await act(async () => mockOnChange?.(2));
    expect(swipePhoto).toHaveBeenCalledWith('写真', photos[2], 2);
    await screen.rerender(view(value(2, swipePhoto)));
    expect(screen.getByText('3 / 3')).toBeTruthy();

    // 削除の確認ダイアログが出てModalが引っ込み、キャンセルで戻る
    mockShown = false;
    await screen.rerender(view(value(2, swipePhoto)));
    await act(async () => {});
    mockShown = true;
    await screen.rerender(view(value(2, swipePhoto)));
    await act(async () => {});

    // 作り直したImageViewerはCの位置で始まる（以前は開いた時点のAに戻っていた）
    expect(mockMounts[mockMounts.length - 1]).toBe(2);
    expect(screen.getByText('3 / 3')).toBeTruthy();
  });

  it('表示中のスワイプでは作り直さない（位置を取り直すと表示が飛ぶ）', async () => {
    const screen = await render(view(value(0)));
    await act(async () => {});
    await screen.rerender(view(value(1)));
    await act(async () => {});
    expect(mockMounts).toEqual([0]);
  });
});

/**
 * データ一覧の表の監査修正（docs/EDIT_AUDIT_2026-11.md の E-M15・E-L12）
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { DataTable } from '../DataTable';
import { DataContext } from '../../../contexts/Data';
import { CheckListItem, LayerType, RecordType } from '../../../types';

jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'View',
}));

jest.mock('react-native-draggable-flatlist', () => {
  const ReactModule = require('react');
  const { FlatList } = require('react-native');
  return {
    __esModule: true,
    default: (props: { renderItem: (p: object) => React.ReactNode }) =>
      ReactModule.createElement(FlatList, {
        ...props,
        renderItem: ({ item, index }: { item: RecordType; index: number }) =>
          props.renderItem({ item, getIndex: () => index, drag: jest.fn(), isActive: false }),
      }),
  };
});

jest.mock('react-native-gesture-handler', () => ({
  ScrollView: jest.fn(({ children }) => children),
  State: {},
  PanGestureHandler: jest.fn(({ children }) => children),
  BaseButton: jest.fn(({ children }) => children),
  Directions: {},
}));

const layer = {
  id: 'layer1',
  name: 'L',
  type: 'POINT',
  permission: 'PRIVATE',
  field: [{ id: 'f1', name: 'Name', format: 'STRING' }],
  active: true,
} as unknown as LayerType;

const rec = (id: string, visible = true): RecordType => ({
  id,
  userId: 'u1',
  displayName: 'U',
  visible,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: { Name: id },
  updatedAt: 1,
});

const buildTable = (sortedRecordSet: RecordType[], checkList: CheckListItem[], overrides: object = {}) => {
  const value = {
    projectId: undefined,
    isOwnerAdmin: false,
    sortedRecordSet,
    layer,
    isChecked: checkList.some((c) => c.checked),
    checkList,
    isMapMemoLayer: false,
    sortedName: '',
    sortedOrder: 'UNSORTED' as const,
    isEditable: true,
    isExporting: false,
    exportProgress: '',
    isLocationEnabled: true,
    isLocationLocked: false,
    pressToggleLocation: jest.fn(),
    pressToggleLocationLock: jest.fn(),
    filterText: '',
    filterFieldName: '',
    isFiltering: false,
    setFilter: jest.fn(),
    clearFilter: jest.fn(),
    getFieldCandidates: jest.fn(() => []),
    filterTarget: undefined,
    openFilterDialog: jest.fn(),
    closeFilterDialog: jest.fn(),
    applyFilter: jest.fn(),
    showOnlyFilteredRecords: jest.fn(),
    changeOrder: jest.fn(),
    changeChecked: jest.fn(),
    changeCheckedAll: jest.fn(),
    changeVisible: jest.fn(),
    changeVisibleAll: jest.fn(),
    addDataByDictionary: jest.fn(),
    pressAddData: jest.fn(),
    pressDeleteData: jest.fn(),
    pressExportData: jest.fn(),
    cancelExportData: jest.fn(),
    gotoDataEdit: jest.fn(),
    gotoBack: jest.fn(),
    updateRecordSetOrder: jest.fn(),
    ...overrides,
  };
  return (
    <DataContext.Provider value={value}>
      <DataTable />
    </DataContext.Provider>
  );
};

const renderTable = async (sortedRecordSet: RecordType[], checkList: CheckListItem[], overrides: object = {}) =>
  await render(buildTable(sortedRecordSet, checkList, overrides));

type JsonNode = { props?: { name?: unknown }; children?: (JsonNode | string)[] | null };
//アイコンは View にモックしているので、描画結果の name を数える
const countIcons = (view: { toJSON: () => unknown }, name: string) => {
  let count = 0;
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as JsonNode;
    if (n.props?.name === name) count += 1;
    n.children?.forEach(walk);
  };
  walk(view.toJSON());
  return count;
};

describe('E-L12 見出しのボタンは実際の状態を表す', () => {
  it('全件チェック済みなら、見出しの全選択もチェック済みで表示する', async () => {
    const view = await renderTable(
      [rec('a'), rec('b')],
      [
        { id: 0, recordId: 'a', checked: true },
        { id: 1, recordId: 'b', checked: true },
      ]
    );
    //行2つ＋見出し1つ
    expect(countIcons(view, 'checkbox-marked-outline')).toBe(3);
  });

  it('全件非表示なら、見出しの目も非表示で表示する', async () => {
    const view = await renderTable(
      [rec('a', false), rec('b', false)],
      [
        { id: 0, recordId: 'a', checked: false },
        { id: 1, recordId: 'b', checked: false },
      ]
    );
    expect(countIcons(view, 'eye-off-outline')).toBe(3);
    expect(countIcons(view, 'eye')).toBe(0);
  });
});

describe('E-M15 行のチェックは記録のidで引く', () => {
  //描画順（見出し→各行）にチェックボックスのアイコン名を並べる
  const checkboxSequence = (view: { toJSON: () => unknown }) => {
    const names: string[] = [];
    const walk = (node: unknown) => {
      if (node === null || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      const n = node as JsonNode;
      if (n.props?.name === 'checkbox-marked-outline') names.push('marked');
      if (n.props?.name === 'checkbox-blank-outline') names.push('blank');
      n.children?.forEach(walk);
    };
    walk(view.toJSON());
    return names;
  };
  //checkList の並びは a, b（記録 b だけチェック済み）。表示順と位置を意図的にずらす
  const checkList: CheckListItem[] = [
    { id: 0, recordId: 'a', checked: false },
    { id: 1, recordId: 'b', checked: true },
  ];

  it('並び順と checkList の位置がずれていても、その記録のチェック状態を出す', async () => {
    const view = await renderTable([rec('b'), rec('a')], checkList);
    //見出し（一部だけなので未チェック）→ b（チェック済み）→ a
    expect(checkboxSequence(view)).toEqual(['blank', 'marked', 'blank']);
  });

  it('並べ替えて描き直すと、チェック表示が記録に付いてくる（メモ化された行が古い表示のまま残らない）', async () => {
    const view = await renderTable([rec('b'), rec('a')], checkList);
    expect(checkboxSequence(view)).toEqual(['blank', 'marked', 'blank']);
    //同じ checkList のまま表示順だけ入れ替えて、同じ木を描き直す
    await view.rerender(buildTable([rec('a'), rec('b')], checkList));
    expect(checkboxSequence(view)).toEqual(['blank', 'blank', 'marked']);
  });

  it('行のチェックボックスを押すと、その記録のidで changeChecked を呼ぶ', async () => {
    const changeChecked = jest.fn();
    const view = await renderTable([rec('b'), rec('a')], checkList, { changeChecked });
    const rowBoxes = view.container.queryAll(
      (node) => node.props.name === 'checkbox-marked-outline' || node.props.name === 'checkbox-blank-outline'
    );
    //先頭は見出しの全選択
    expect(rowBoxes.length).toBe(3);
    await fireEvent.press(rowBoxes[2]);
    expect(changeChecked).toHaveBeenCalledWith('a', true);
    await fireEvent.press(rowBoxes[1]);
    expect(changeChecked).toHaveBeenCalledWith('b', false);
  });
});

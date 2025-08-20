import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useData } from '../useData';
import dataSetReducer, { updateRecordsAction, addRecordsAction } from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import settingsReducer from '../../modules/settings';
import userReducer from '../../modules/user';
import { RecordType, LayerType } from '../../types';

// モックナビゲーション
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({
    name: 'Data',
    params: {},
  }),
}));

jest.mock('../useProject', () => ({
  useProject: () => ({
    isSettingProject: false,
  }),
}));

// テスト用のストアを作成
const createTestStore = (initialData: RecordType[] = []) => {
  return configureStore({
    reducer: {
      dataSet: dataSetReducer,
      layers: layersReducer,
      settings: settingsReducer,
      user: userReducer,
    },
    preloadedState: {
      dataSet: [{
        layerId: 'layer1',
        userId: 'user1',
        data: initialData,
      }],
      layers: [
        {
          id: 'layer1',
          name: 'Test Layer',
          type: 'POINT',
          permission: 'PRIVATE',
          field: [
            { id: 'field1', name: 'Name', format: 'STRING' },
            { id: 'field2', name: 'Value', format: 'DECIMAL' },
          ],
          active: true,
        } as LayerType,
      ],
      settings: {
        tutrials: {
          POINTTOOL_PLOT_POINT: true,
          POINTTOOL_ADD_LOCATION_POINT: true,
          LINETOOL_PLOT_LINE: true,
          LINETOOL_FREEHAND_LINE: true,
          POLYGONTOOL_PLOT_POLYGON: true,
          POLYGONTOOL_FREEHAND_POLYGON: true,
          SELECTIONTOOL: true,
          INFOTOOL: true,
          LAYERS_BTN_IMPORT: true,
          HOME_BTN_GPS: true,
          HOME_BTN_TRACK: true,
          MAPS_BTN_ONLINE: true,
          MAPS_BTN_OFFLINE: true,
          PENCILMODE: true,
        },
        updatedAt: '',
        role: undefined,
        mapType: 'standard' as const,
        mapRegion: {
          latitude: 0,
          longitude: 0,
          latitudeDelta: 0,
          longitudeDelta: 0,
          zoom: 0,
        },
        isSettingProject: false,
        isSynced: false,
        isOffline: false,
        tileRegions: [],
        projectId: 'project1',
        projectName: undefined,
        projectRegion: {
          latitude: 0,
          longitude: 0,
          latitudeDelta: 0,
          longitudeDelta: 0,
          zoom: 0,
        },
        memberLocation: [],
        isEditingRecord: false,
        selectedRecord: undefined,
        plugins: {},
        mapListURL: '',
        mapList: [],
        gpsAccuracy: 'HIGH' as const,
        agreedTermsVersion: '',
        isModalInfoToolHidden: false,
        isModalMapMemoToolHidden: false,
        currentInfoTool: 'ALL_INFO' as const,
      },
      user: {
        uid: 'user1',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: null,
        emailVerified: true,
      },
    },
  });
};

const createMockRecord = (id: string, name: string, value: number): RecordType => ({
  id,
  userId: 'user1',
  displayName: 'Test User',
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: {
    name,
    value,
  },
  updatedAt: Date.now(),
});

describe('useData', () => {
  describe('Reduxストアの更新が反映される', () => {
    it('updateRecordsActionでレコードが更新された時、sortedRecordSetも更新される', () => {
      const initialRecord = createMockRecord('record1', 'Initial Name', 100);
      const store = createTestStore([initialRecord]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result, rerender } = renderHook(() => useData('layer1'), { wrapper });

      // 初期状態の確認
      expect(result.current.sortedRecordSet).toHaveLength(1);
      expect(result.current.sortedRecordSet[0].field.name).toBe('Initial Name');
      expect(result.current.sortedRecordSet[0].field.value).toBe(100);

      // レコードを更新
      const updatedRecord = createMockRecord('record1', 'Updated Name', 200);
      act(() => {
        store.dispatch(
          updateRecordsAction({
            layerId: 'layer1',
            userId: 'user1',
            data: [updatedRecord],
          })
        );
      });

      // 再レンダリングを強制
      rerender();

      // 更新後の値が反映されていることを確認
      expect(result.current.sortedRecordSet).toHaveLength(1);
      expect(result.current.sortedRecordSet[0].field.name).toBe('Updated Name');
      expect(result.current.sortedRecordSet[0].field.value).toBe(200);
    });

    it('新しいレコードが追加された時、sortedRecordSetに反映される', () => {
      const initialRecord = createMockRecord('record1', 'Record 1', 100);
      const store = createTestStore([initialRecord]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result, rerender } = renderHook(() => useData('layer1'), { wrapper });

      // 初期状態の確認
      expect(result.current.sortedRecordSet).toHaveLength(1);

      // 新しいレコードを追加
      const newRecord = createMockRecord('record2', 'Record 2', 200);
      act(() => {
        store.dispatch(
          addRecordsAction({
            layerId: 'layer1',
            userId: 'user1',
            data: [newRecord],
          })
        );
      });

      // 再レンダリングを強制
      rerender();

      // 新しいレコードが追加されていることを確認
      expect(result.current.sortedRecordSet).toHaveLength(2);
      expect(result.current.sortedRecordSet.find(r => r.id === 'record2')).toBeTruthy();
      expect(result.current.sortedRecordSet.find(r => r.id === 'record2')?.field.name).toBe('Record 2');
    });

    it('複数のレコードが同時に更新された時、全て正しく反映される', () => {
      const initialRecords = [
        createMockRecord('record1', 'Name 1', 100),
        createMockRecord('record2', 'Name 2', 200),
        createMockRecord('record3', 'Name 3', 300),
      ];
      const store = createTestStore(initialRecords);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result, rerender } = renderHook(() => useData('layer1'), { wrapper });

      // 初期状態の確認
      expect(result.current.sortedRecordSet).toHaveLength(3);

      // 複数のレコードを更新
      const updatedRecords = [
        createMockRecord('record1', 'Updated 1', 150),
        createMockRecord('record2', 'Updated 2', 250),
        createMockRecord('record3', 'Updated 3', 350),
      ];

      act(() => {
        store.dispatch(
          updateRecordsAction({
            layerId: 'layer1',
            userId: 'user1',
            data: updatedRecords,
          })
        );
      });

      // 再レンダリングを強制
      rerender();

      // 全てのレコードが更新されていることを確認
      expect(result.current.sortedRecordSet).toHaveLength(3);
      expect(result.current.sortedRecordSet[0].field.name).toBe('Updated 1');
      expect(result.current.sortedRecordSet[0].field.value).toBe(150);
      expect(result.current.sortedRecordSet[1].field.name).toBe('Updated 2');
      expect(result.current.sortedRecordSet[1].field.value).toBe(250);
      expect(result.current.sortedRecordSet[2].field.name).toBe('Updated 3');
      expect(result.current.sortedRecordSet[2].field.value).toBe(350);
    });
  });

  describe('ソート機能', () => {
    it('changeOrderで正しくソートされる', () => {
      const records = [
        createMockRecord('record1', 'B Name', 200),
        createMockRecord('record2', 'A Name', 300),
        createMockRecord('record3', 'C Name', 100),
      ];
      const store = createTestStore(records);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result } = renderHook(() => useData('layer1'), { wrapper });

      // 名前で昇順ソート
      act(() => {
        result.current.changeOrder('name', 'ASCENDING');
      });

      expect(result.current.sortedRecordSet[0].field.name).toBe('A Name');
      expect(result.current.sortedRecordSet[1].field.name).toBe('B Name');
      expect(result.current.sortedRecordSet[2].field.name).toBe('C Name');

      // 値で降順ソート
      act(() => {
        result.current.changeOrder('value', 'DESCENDING');
      });

      expect(result.current.sortedRecordSet[0].field.value).toBe(300);
      expect(result.current.sortedRecordSet[1].field.value).toBe(200);
      expect(result.current.sortedRecordSet[2].field.value).toBe(100);
    });
  });

  describe('チェック機能', () => {
    it('changeCheckedで個別のチェック状態が変更される', () => {
      const record = createMockRecord('record1', 'Test', 100);
      const store = createTestStore([record]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result } = renderHook(() => useData('layer1'), { wrapper });

      // 初期状態の確認
      expect(result.current.checkList[0].checked).toBe(false);
      expect(result.current.isChecked).toBe(false);

      // チェックを入れる
      act(() => {
        result.current.changeChecked(0, true);
      });

      expect(result.current.checkList[0].checked).toBe(true);
      expect(result.current.isChecked).toBe(true);
      expect(result.current.checkedRecords).toHaveLength(1);
    });

    it('changeCheckedAllで全てのチェック状態が変更される', () => {
      const records = [
        createMockRecord('record1', 'Name 1', 100),
        createMockRecord('record2', 'Name 2', 200),
        createMockRecord('record3', 'Name 3', 300),
      ];
      const store = createTestStore(records);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result } = renderHook(() => useData('layer1'), { wrapper });

      // 全てチェックを入れる
      act(() => {
        result.current.changeCheckedAll(true);
      });

      expect(result.current.checkList.every(item => item.checked)).toBe(true);
      expect(result.current.checkedRecords).toHaveLength(3);

      // 全てチェックを外す
      act(() => {
        result.current.changeCheckedAll(false);
      });

      expect(result.current.checkList.every(item => !item.checked)).toBe(true);
      expect(result.current.checkedRecords).toHaveLength(0);
    });
  });
});
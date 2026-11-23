import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { clearAllVisibilitySnapshots, useData } from '../useData';
import dataSetReducer, { updateRecordsAction, addRecordsAction } from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import settingsReducer from '../../modules/settings';
import userReducer from '../../modules/user';
import { RecordType, LayerType } from '../../types';

jest.mock('../useProject', () => ({
  useProject: () => ({
    isSettingProject: false,
  }),
}));

// テスト用のストアを作成
const createTestStore = (initialData: RecordType[] = [], layerOverrides: Partial<LayerType> = {}) => {
  return configureStore({
    reducer: {
      dataSet: dataSetReducer,
      layers: layersReducer,
      settings: settingsReducer,
      user: userReducer,
    },
    preloadedState: {
      dataSet: [
        {
          layerId: 'layer1',
          userId: 'user1',
          data: initialData,
        },
      ],
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
          ...layerOverrides,
        } as LayerType,
      ],
      settings: {
        tutrials: {
          POINTTOOL_PLOT_POINT: true,
          POINTTOOL_ADD_LOCATION_POINT: true,
          LINETOOL_PLOT_LINE: true,
          POLYGONTOOL_PLOT_POLYGON: true,
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
        isEditingLayer: false,
        isEditingMap: false,
        selectedRecord: undefined,
        plugins: {},
        mapListURL: '',
        mapList: [],
        gpsAccuracy: 'HIGH' as const,
        agreedTermsVersion: '',
        lastSeenVersion: '',
        isModalInfoToolHidden: false,
        currentInfoTool: 'ALL_INFO' as const,
        showMockGPSButton: false,
        proximityAlert: {
          enabled: false,
          targetLayerIds: [],
          distanceThreshold: 10,
        },
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
  describe('REFERENCEフィールドでのデータ取得', () => {
    it('参照レイヤーのデータが正しく初期化される', () => {
      // 参照レイヤー用のデータを準備
      const refLayerRecords: RecordType[] = [
        {
          id: 'ref1',
          userId: 'user1',
          displayName: 'Test User',
          visible: true,
          redraw: false,
          coords: { latitude: 35.6762, longitude: 139.6503 },
          field: {
            refName: 'Reference Item 1',
            refValue: 100,
          },
          updatedAt: Date.now(),
        },
        {
          id: 'ref2',
          userId: 'user1',
          displayName: 'Test User',
          visible: true,
          redraw: false,
          coords: { latitude: 35.6763, longitude: 139.6504 },
          field: {
            refName: 'Reference Item 2',
            refValue: 200,
          },
          updatedAt: Date.now(),
        },
      ];

      const store = configureStore({
        reducer: {
          dataSet: dataSetReducer,
          layers: layersReducer,
          settings: settingsReducer,
          user: userReducer,
        },
        preloadedState: {
          dataSet: [
            {
              layerId: 'mainLayer',
              userId: 'user1',
              data: [],
            },
            {
              layerId: 'refLayer',
              userId: 'user1',
              data: refLayerRecords,
            },
          ],
          layers: [
            {
              id: 'mainLayer',
              name: 'Main Layer',
              type: 'POINT',
              permission: 'PRIVATE',
              field: [
                { id: 'field1', name: 'Name', format: 'STRING' },
                {
                  id: 'field2',
                  name: 'Reference',
                  format: 'REFERENCE',
                  list: [
                    { value: 'refLayer', isOther: false, customFieldValue: '' },
                    { value: 'refName', isOther: false, customFieldValue: '' },
                    { value: '_id', isOther: false, customFieldValue: '' },
                  ],
                },
              ],
              active: true,
            } as LayerType,
            {
              id: 'refLayer',
              name: 'Reference Layer',
              type: 'POINT',
              permission: 'PRIVATE',
              field: [
                { id: 'refField1', name: 'refName', format: 'STRING' },
                { id: 'refField2', name: 'refValue', format: 'DECIMAL' },
              ],
              active: true,
              sortedOrder: 'UNSORTED',
              sortedName: '',
            } as LayerType,
          ],
          settings: {
            tutrials: {
              POINTTOOL_PLOT_POINT: true,
              POINTTOOL_ADD_LOCATION_POINT: true,
              LINETOOL_PLOT_LINE: true,
              POLYGONTOOL_PLOT_POLYGON: true,
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
            isEditingLayer: false,
            isEditingMap: false,
            selectedRecord: undefined,
            plugins: {},
            mapListURL: '',
            mapList: [],
            gpsAccuracy: 'HIGH' as const,
            agreedTermsVersion: '',
            lastSeenVersion: '',
            isModalInfoToolHidden: false,
            currentInfoTool: 'ALL_INFO' as const,
            showMockGPSButton: false,
            proximityAlert: {
              enabled: false,
              targetLayerIds: [],
              distanceThreshold: 10,
            },
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

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

      // 参照レイヤーのデータを取得
      const { result } = renderHook(() => useData('refLayer'), { wrapper });

      // sortedRecordSetが正しく初期化されていることを確認
      // これが空配列になってしまうバグを検出できる
      expect(result.current.sortedRecordSet).toHaveLength(2);
      expect(result.current.sortedRecordSet[0].id).toBe('ref1');
      expect(result.current.sortedRecordSet[1].id).toBe('ref2');
      expect(result.current.sortedRecordSet[0].field.refName).toBe('Reference Item 1');
      expect(result.current.sortedRecordSet[1].field.refValue).toBe(200);
    });

    it('参照レイヤーで新しいレコードを追加できる', () => {
      const store = configureStore({
        reducer: {
          dataSet: dataSetReducer,
          layers: layersReducer,
          settings: settingsReducer,
          user: userReducer,
        },
        preloadedState: {
          dataSet: [
            {
              layerId: 'refLayer',
              userId: 'user1',
              data: [],
            },
          ],
          layers: [
            {
              id: 'refLayer',
              name: 'Reference Layer',
              type: 'POINT',
              permission: 'PRIVATE',
              field: [
                { id: 'refField1', name: 'refName', format: 'STRING' },
                { id: 'refField2', name: 'refValue', format: 'DECIMAL' },
              ],
              active: true,
              sortedOrder: 'UNSORTED',
              sortedName: '',
            } as LayerType,
          ],
          settings: {
            tutrials: {
              POINTTOOL_PLOT_POINT: true,
              POINTTOOL_ADD_LOCATION_POINT: true,
              LINETOOL_PLOT_LINE: true,
              POLYGONTOOL_PLOT_POLYGON: true,
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
            isEditingLayer: false,
            isEditingMap: false,
            selectedRecord: undefined,
            plugins: {},
            mapListURL: '',
            mapList: [],
            gpsAccuracy: 'HIGH' as const,
            agreedTermsVersion: '',
            lastSeenVersion: '',
            isModalInfoToolHidden: false,
            currentInfoTool: 'ALL_INFO' as const,
            showMockGPSButton: false,
            proximityAlert: {
              enabled: false,
              targetLayerIds: [],
              distanceThreshold: 10,
            },
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

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

      const { result } = renderHook(() => useData('refLayer'), { wrapper });

      // 初期状態は空
      expect(result.current.sortedRecordSet).toHaveLength(0);

      // addDefaultRecordで新しい参照レコードを追加
      let newRecord: RecordType | undefined;
      act(() => {
        newRecord = result.current.addDefaultRecord({
          refName: 'New Reference',
          refValue: 300,
        });
      });

      // レコードが追加されたことを確認
      expect(newRecord).toBeDefined();
      expect(newRecord?.field.refName).toBe('New Reference');
      expect(newRecord?.field.refValue).toBe(300);
    });
  });

  describe('Reduxストアの更新が反映される', () => {
    it('updateRecordsActionでレコードが更新された時、sortedRecordSetも更新される', () => {
      const initialRecord = createMockRecord('record1', 'Initial Name', 100);
      const store = createTestStore([initialRecord]);

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

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

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

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
      expect(result.current.sortedRecordSet.find((r) => r.id === 'record2')).toBeTruthy();
      expect(result.current.sortedRecordSet.find((r) => r.id === 'record2')?.field.name).toBe('Record 2');
    });

    it('複数のレコードが同時に更新された時、全て正しく反映される', () => {
      const initialRecords = [
        createMockRecord('record1', 'Name 1', 100),
        createMockRecord('record2', 'Name 2', 200),
        createMockRecord('record3', 'Name 3', 300),
      ];
      const store = createTestStore(initialRecords);

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

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

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

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

    it('列を並べ替えた状態で追加しても連番(SERIAL)が正しく採番される', () => {
      // SERIALフィールドを持つレイヤーを用意（ストア順の末尾が最新追加レコード=連番3）
      const records: RecordType[] = [
        { ...createMockRecord('record1', 'A', 1), field: { serial: 1 } },
        { ...createMockRecord('record2', 'B', 2), field: { serial: 2 } },
        { ...createMockRecord('record3', 'C', 3), field: { serial: 3 } },
      ];
      const store = createTestStore(records, {
        field: [{ id: 'fieldSerial', name: 'serial', format: 'SERIAL' }],
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

      const { result } = renderHook(() => useData('layer1'), { wrapper });

      // serialで降順ソート（末尾が連番1のレコードになる）
      act(() => {
        result.current.changeOrder('serial', 'DESCENDING');
      });
      expect(result.current.sortedRecordSet[result.current.sortedRecordSet.length - 1].field.serial).toBe(1);

      // ソート状態のまま新規追加
      let newRecord: RecordType | undefined;
      act(() => {
        newRecord = result.current.addDefaultRecord();
      });

      // ソート末尾(連番1)+1=2 ではなく、最新追加レコード基準の 4 になること
      expect(newRecord?.field.serial).toBe(4);
    });

    it('列ソート中はドラッグでのストア順置き換えを受け付けない', () => {
      // ソート順でストア順(追加順)が上書きされると、以降の連番採番が壊れて重複する
      const records: RecordType[] = [
        { ...createMockRecord('record1', 'A', 1), field: { serial: 1 } },
        { ...createMockRecord('record2', 'B', 2), field: { serial: 2 } },
        { ...createMockRecord('record3', 'C', 3), field: { serial: 3 } },
      ];
      const store = createTestStore(records, {
        field: [{ id: 'fieldSerial', name: 'serial', format: 'SERIAL' }],
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

      const { result } = renderHook(() => useData('layer1'), { wrapper });

      // serialで降順ソートし、表示順(末尾が連番1)でドラッグ終了が発火したと想定
      act(() => {
        result.current.changeOrder('serial', 'DESCENDING');
      });
      act(() => {
        result.current.updateRecordSetOrder(result.current.sortedRecordSet);
      });

      // ストア順は追加順のまま維持されること
      expect(store.getState().dataSet[0].data.map((r: RecordType) => r.id)).toEqual([
        'record1',
        'record2',
        'record3',
      ]);
    });

    it('未ソートならドラッグでのストア順置き換えを受け付ける', () => {
      const records: RecordType[] = [
        { ...createMockRecord('record1', 'A', 1), field: { serial: 1 } },
        { ...createMockRecord('record2', 'B', 2), field: { serial: 2 } },
        { ...createMockRecord('record3', 'C', 3), field: { serial: 3 } },
      ];
      const store = createTestStore(records, {
        field: [{ id: 'fieldSerial', name: 'serial', format: 'SERIAL' }],
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

      const { result } = renderHook(() => useData('layer1'), { wrapper });

      const reordered = [records[2], records[0], records[1]];
      act(() => {
        result.current.updateRecordSetOrder(reordered);
      });

      expect(store.getState().dataSet[0].data.map((r: RecordType) => r.id)).toEqual([
        'record3',
        'record1',
        'record2',
      ]);
    });
  });

  describe('並べ替えで一覧に出ないレコードを消さない（同期監査 S5）', () => {
    it('削除の墓標と _group でぶら下がる子レコードは、並べ替えても集合に残る', () => {
      const parent1 = createMockRecord('p1', 'A', 1);
      const parent2 = createMockRecord('p2', 'B', 2);
      const child = { ...createMockRecord('c1', 'child', 0), field: { _group: 'p1' } };
      const tombstone = { ...createMockRecord('d1', 'deleted', 0), deleted: true, uploaded: true };
      const store = createTestStore([parent1, child, tombstone, parent2]);
      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
      const { result } = renderHook(() => useData('layer1'), { wrapper });

      expect(result.current.sortedRecordSet.map((r: RecordType) => r.id)).toEqual(['p1', 'p2']);
      act(() => {
        result.current.updateRecordSetOrder([parent2, parent1]);
      });

      expect(store.getState().dataSet[0].data.map((r: RecordType) => r.id)).toEqual(['p2', 'p1', 'c1', 'd1']);
    });
  });

  describe('チェック機能', () => {
    it('changeCheckedで個別のチェック状態が変更される', () => {
      const record = createMockRecord('record1', 'Test', 100);
      const store = createTestStore([record]);

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

      const { result } = renderHook(() => useData('layer1'), { wrapper });

      // 初期状態の確認
      expect(result.current.checkList[0].checked).toBe(false);
      expect(result.current.isChecked).toBe(false);

      // チェックを入れる
      act(() => {
        result.current.changeChecked(result.current.sortedRecordSet[0].id, true);
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

      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

      const { result } = renderHook(() => useData('layer1'), { wrapper });

      // 全てチェックを入れる
      act(() => {
        result.current.changeCheckedAll(true);
      });

      expect(result.current.checkList.every((item) => item.checked)).toBe(true);
      expect(result.current.checkedRecords).toHaveLength(3);

      // 全てチェックを外す
      act(() => {
        result.current.changeCheckedAll(false);
      });

      expect(result.current.checkList.every((item) => !item.checked)).toBe(true);
      expect(result.current.checkedRecords).toHaveLength(0);
    });
  });
  describe('絞り込みと地図表示', () => {
    //スナップショットはモジュールスコープなのでテスト間で持ち越さない
    beforeEach(() => {
      clearAllVisibilitySnapshots();
    });

    //createMockRecordのfieldキーはレイヤ定義(Name/Value)と綴りが違うため、ここでは実際のキーで作る
    const createRecord = (id: string, name: string, visible: boolean): RecordType => ({
      id,
      userId: 'user1',
      displayName: 'Test User',
      visible,
      redraw: false,
      coords: { latitude: 0, longitude: 0 },
      field: { Name: name, Value: 1 },
      updatedAt: 1,
    });

    const setup = () => {
      const records = [
        createRecord('r1', 'スギ', true),
        createRecord('r2', 'ミズナラ', false),
        createRecord('r3', 'スギナ', true),
      ];
      const store = createTestStore(records);
      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
      const { result, rerender, unmount } = renderHook(() => useData('layer1'), { wrapper });
      return { store, result, rerender, unmount };
    };

    const visibilityOf = (store: ReturnType<typeof createTestStore>) =>
      Object.fromEntries(store.getState().dataSet[0].data.map((r: RecordType) => [r.id, r.visible]));

    it('絞り込むと一致するレコードだけが一覧に残る', () => {
      const { result } = setup();
      act(() => {
        result.current.setFilter('スギ', 'Name');
      });
      expect(result.current.sortedRecordSet.map((r) => r.id)).toEqual(['r1', 'r3']);
      expect(result.current.isFiltering).toBe(true);
    });

    it('絞り込み中は並べ替えを受け付けない', () => {
      const { store, result } = setup();
      act(() => {
        result.current.setFilter('スギ', 'Name');
      });
      act(() => {
        result.current.updateRecordSetOrder([]);
      });
      //絞り込みから外れたレコードが消えていないこと
      expect(store.getState().dataSet[0].data).toHaveLength(3);
    });

    it('地図表示ボタンで絞り込み結果だけが表示になる', () => {
      const { store, result, rerender } = setup();
      act(() => {
        result.current.setFilter('スギ', 'Name');
      });
      rerender();
      act(() => {
        result.current.showOnlyFilteredRecords();
      });
      expect(visibilityOf(store)).toEqual({ r1: true, r2: false, r3: true });
    });

    it('絞り込みを解除するとボタンを押す前の表示状態に戻る', () => {
      const { store, result, rerender } = setup();
      act(() => {
        result.current.setFilter('ミズナラ', 'Name');
      });
      rerender();
      act(() => {
        result.current.showOnlyFilteredRecords();
      });
      //非表示だったr2だけが表示になっている
      expect(visibilityOf(store)).toEqual({ r1: false, r2: true, r3: false });

      rerender();
      act(() => {
        result.current.clearFilter();
      });
      //押す前の状態（r2だけ非表示）に戻る
      expect(visibilityOf(store)).toEqual({ r1: true, r2: false, r3: true });
      expect(result.current.filterFieldName).toBe('');
    });

    it('画面を開き直しても絞り込みは維持され、解除するまで残る', () => {
      const { store, result, unmount } = setup();
      act(() => {
        result.current.setFilter('スギ', 'Name');
      });

      //画面遷移でhookがアンマウントされても条件が残ること
      unmount();
      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
      const remounted = renderHook(() => useData('layer1'), { wrapper });
      expect(remounted.result.current.filterText).toBe('スギ');
      expect(remounted.result.current.sortedRecordSet.map((r) => r.id)).toEqual(['r1', 'r3']);

      act(() => {
        remounted.result.current.clearFilter();
      });
      expect(remounted.result.current.filterText).toBe('');
      expect(remounted.result.current.sortedRecordSet).toHaveLength(3);
    });

    it('地図表示ボタンを押していなければ解除しても表示状態は変えない', () => {
      const { store, result } = setup();
      act(() => {
        result.current.setFilter('スギ', 'Name');
      });
      act(() => {
        result.current.clearFilter();
      });
      expect(visibilityOf(store)).toEqual({ r1: true, r2: false, r3: true });
    });
  });

  describe('_group でぶら下がる子を親と一緒に扱う（同期監査 M14）', () => {
    beforeEach(() => {
      clearAllVisibilitySnapshots();
    });

    //親・子ともレイヤ定義の Name を持たせ、絞り込みの対象を親だけにできるようにする
    const parentRecord = (id: string, name: string, extra: Record<string, string> = {}): RecordType => ({
      id,
      userId: 'user1',
      displayName: 'Test User',
      visible: true,
      redraw: false,
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      field: { Name: name, ...extra },
      updatedAt: 1,
    });
    const childRecord = (id: string, parentId: string): RecordType => ({
      ...parentRecord(id, ''),
      field: { _group: parentId, _stamp: 'arrow' },
    });

    const setup = (records: RecordType[]) => {
      const store = createTestStore(records, { type: 'LINE' });
      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
      const { result, rerender } = renderHook(() => useData('layer1'), { wrapper });
      return { store, result, rerender };
    };
    const idsInStore = (store: ReturnType<typeof createTestStore>) =>
      store.getState().dataSet[0].data.map((r: RecordType) => r.id);
    const visibilityOf = (store: ReturnType<typeof createTestStore>) =>
      Object.fromEntries(store.getState().dataSet[0].data.map((r: RecordType) => [r.id, r.visible]));

    it('マップメモの親を一覧から削除すると、子ストロークも消える', () => {
      const memo = parentRecord('m1', 'メモ', { _strokeColor: '#ff0000' });
      const other = parentRecord('m2', '別メモ', { _strokeColor: '#00ff00' });
      const { store, result } = setup([memo, childRecord('c1', 'm1'), childRecord('c2', 'm1'), other]);
      expect(result.current.isMapMemoLayer).toBe(true);
      //一覧には子が出ない
      expect(result.current.sortedRecordSet.map((r) => r.id)).toEqual(['m1', 'm2']);

      act(() => {
        result.current.changeChecked(result.current.sortedRecordSet[0].id, true);
      });
      act(() => {
        result.current.deleteRecords();
      });
      expect(idsInStore(store)).toEqual(['m2']);
    });

    it('マップメモでない作図レイヤ（飛翔図の行動記号）でも、親の線と一緒に子が消える', () => {
      const line = parentRecord('l1', '飛翔1');
      const { store, result } = setup([line, childRecord('c1', 'l1'), parentRecord('l2', '飛翔2')]);
      expect(result.current.isMapMemoLayer).toBe(false);

      act(() => {
        result.current.changeChecked(result.current.sortedRecordSet[0].id, true);
      });
      act(() => {
        result.current.deleteRecords();
      });
      expect(idsInStore(store)).toEqual(['l2']);
    });

    it('アップロード済みの子は墓標になり、削除がクラウドにも届く', () => {
      const line = { ...parentRecord('l1', '飛翔1'), uploaded: true };
      const child = { ...childRecord('c1', 'l1'), uploaded: true };
      const { store, result } = setup([line, child]);

      act(() => {
        result.current.changeChecked(result.current.sortedRecordSet[0].id, true);
      });
      act(() => {
        result.current.deleteRecords();
      });
      const data = store.getState().dataSet[0].data as RecordType[];
      expect(data.map((r) => [r.id, r.deleted])).toEqual([
        ['l1', true],
        ['c1', true],
      ]);
    });

    it('表示の切り替えは子にも及ぶ', () => {
      const line = parentRecord('l1', '飛翔1');
      const { store, result } = setup([line, childRecord('c1', 'l1'), parentRecord('l2', '飛翔2')]);

      act(() => {
        result.current.changeVisible(result.current.sortedRecordSet[0]);
      });
      expect(visibilityOf(store)).toEqual({ l1: false, c1: false, l2: true });
    });

    it('別の名義の子は表示切り替えで親の集合に複製しない', () => {
      const store = configureStore({
        reducer: { dataSet: dataSetReducer, layers: layersReducer, settings: settingsReducer, user: userReducer },
        preloadedState: {
          ...createTestStore([], { type: 'LINE' }).getState(),
          dataSet: [
            { layerId: 'layer1', userId: 'user1', data: [parentRecord('l1', '飛翔1')] },
            { layerId: 'layer1', userId: 'user2', data: [{ ...childRecord('c9', 'l1'), userId: 'user2' }] },
          ],
        },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
      const { result } = renderHook(() => useData('layer1'), { wrapper });

      act(() => {
        result.current.changeVisible(result.current.sortedRecordSet[0]);
      });
      expect(store.getState().dataSet[0].data.map((r: RecordType) => r.id)).toEqual(['l1']);
    });

    it('絞り込み結果だけ表示すると子も表示され、解除すると子も元の表示に戻る', () => {
      const hiddenChild = { ...childRecord('c2', 'l2'), visible: false };
      const { store, result, rerender } = setup([
        parentRecord('l1', 'スギ'),
        childRecord('c1', 'l1'),
        parentRecord('l2', 'ミズナラ'),
        hiddenChild,
      ]);
      act(() => {
        result.current.setFilter('スギ', 'Name');
      });
      rerender();
      act(() => {
        result.current.showOnlyFilteredRecords();
      });
      expect(visibilityOf(store)).toEqual({ l1: true, c1: true, l2: false, c2: false });

      rerender();
      act(() => {
        result.current.clearFilter();
      });
      expect(visibilityOf(store)).toEqual({ l1: true, c1: true, l2: true, c2: false });
    });

    it('書き出し用に、選んだ親の後ろへ子を付ける（子は一覧に出ないので全レコードから探す）', () => {
      const { result } = setup([
        parentRecord('l1', '飛翔1'),
        parentRecord('l2', '飛翔2'),
        childRecord('c1', 'l1'),
        childRecord('c2', 'l2'),
      ]);
      const [l1] = result.current.sortedRecordSet;
      expect(result.current.withChildRecords([l1]).map((r) => r.id)).toEqual(['l1', 'c1']);
    });
  });
});

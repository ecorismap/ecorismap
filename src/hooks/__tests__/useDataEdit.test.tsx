import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useDataEdit } from '../useDataEdit';
import dataSetReducer, { updateRecordsAction } from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import settingsReducer from '../../modules/settings';
import userReducer from '../../modules/user';
import { RecordType, LayerType } from '../../types';
import { isLocationType } from '../../utils/General';


jest.mock('../useProject', () => ({
  useProject: () => ({
    isSettingProject: false,
  }),
}));

jest.mock('../useRecord', () => ({
  useRecord: () => ({
    selectRecord: jest.fn(),
    setIsEditingRecord: jest.fn(),
  }),
}));

jest.mock('../../contexts/BottomSheetNavigationContext', () => ({
  useBottomSheetNavigation: () => ({
    currentScreen: { name: 'DataEdit', params: {} },
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
}));

// テスト用のストアを作成
const createTestStore = (initialRecords: RecordType[] = []) => {
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
        data: initialRecords,
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
        lastSeenVersion: '',
        isModalInfoToolHidden: false,
        isModalMapMemoToolHidden: false,
        currentInfoTool: 'ALL_INFO' as const,
        showMockGPSButton: false,
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

const createMockRecord = (id: string, lat: number, lon: number): RecordType => ({
  id,
  userId: 'user1',
  displayName: 'Test User',
  visible: true,
  redraw: false,
  coords: { latitude: lat, longitude: lon },
  field: {
    Name: 'Test Point',
    Value: 100,
  },
  updatedAt: Date.now(),
});

const mockLayer: LayerType = {
  id: 'layer1',
  name: 'Test Layer',
  type: 'POINT',
  permission: 'PRIVATE',
  field: [
    { id: 'field1', name: 'Name', format: 'STRING' },
    { id: 'field2', name: 'Value', format: 'DECIMAL' },
  ],
  active: true,
} as LayerType;

describe('useDataEdit', () => {
  describe('緯度経度の更新', () => {
    it('Reduxストアの座標更新時に緯度経度が自動的に更新される', () => {
      const initialRecord = createMockRecord('record1', 35.6762, 139.6503); // 東京タワー
      const store = createTestStore([initialRecord]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result, rerender } = renderHook(() => useDataEdit(initialRecord, mockLayer), { wrapper });

      // 初期状態の確認
      const coords = result.current.targetRecord.coords;
      expect(coords).toBeDefined();
      expect(isLocationType(coords)).toBe(true);
      if (isLocationType(coords)) {
        expect(coords.latitude).toBe(35.6762);
        expect(coords.longitude).toBe(139.6503);
      }
      expect(result.current.latlon.latitude.decimal).toContain('35.6762'); // 文字列として格納される

      // Home画面で位置を変更したことをシミュレート（富士山の座標）
      const updatedRecord = createMockRecord('record1', 35.3606, 138.7274);
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

      // 緯度経度が更新されていることを確認
      const updatedCoords = result.current.targetRecord.coords;
      expect(updatedCoords).toBeDefined();
      expect(isLocationType(updatedCoords)).toBe(true);
      if (isLocationType(updatedCoords)) {
        expect(updatedCoords.latitude).toBe(35.3606);
        expect(updatedCoords.longitude).toBe(138.7274);
      }
      expect(result.current.latlon.latitude.decimal).toContain('35.3606');
      expect(result.current.latlon.longitude.decimal).toContain('138.7274');
    });

    it('複数回の座標更新が正しく反映される', () => {
      const initialRecord = createMockRecord('record1', 35.6762, 139.6503);
      const store = createTestStore([initialRecord]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result, rerender } = renderHook(() => useDataEdit(initialRecord, mockLayer), { wrapper });

      // 初期状態
      const initialCoords = result.current.targetRecord.coords;
      expect(isLocationType(initialCoords)).toBe(true);
      if (isLocationType(initialCoords)) {
        expect(initialCoords.latitude).toBe(35.6762);
      }

      // 1回目の更新
      const updatedRecord1 = createMockRecord('record1', 34.6937, 135.5023); // 大阪
      act(() => {
        store.dispatch(
          updateRecordsAction({
            layerId: 'layer1',
            userId: 'user1',
            data: [updatedRecord1],
          })
        );
      });
      rerender();

      const coords1 = result.current.targetRecord.coords;
      expect(isLocationType(coords1)).toBe(true);
      if (isLocationType(coords1)) {
        expect(coords1.latitude).toBe(34.6937);
        expect(coords1.longitude).toBe(135.5023);
      }

      // 2回目の更新
      const updatedRecord2 = createMockRecord('record1', 43.0642, 141.3469); // 札幌
      act(() => {
        store.dispatch(
          updateRecordsAction({
            layerId: 'layer1',
            userId: 'user1',
            data: [updatedRecord2],
          })
        );
      });
      rerender();

      const coords2 = result.current.targetRecord.coords;
      expect(isLocationType(coords2)).toBe(true);
      if (isLocationType(coords2)) {
        expect(coords2.latitude).toBe(43.0642);
        expect(coords2.longitude).toBe(141.3469);
      }
    });

    it('異なるレコードIDの更新は影響しない', () => {
      const record1 = createMockRecord('record1', 35.6762, 139.6503);
      const record2 = createMockRecord('record2', 34.6937, 135.5023);
      const store = createTestStore([record1, record2]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result, rerender } = renderHook(() => useDataEdit(record1, mockLayer), { wrapper });

      // record1を編集中
      expect(result.current.targetRecord.id).toBe('record1');
      const currentCoords = result.current.targetRecord.coords;
      expect(isLocationType(currentCoords)).toBe(true);
      if (isLocationType(currentCoords)) {
        expect(currentCoords.latitude).toBe(35.6762);
      }

      // record2を更新（record1には影響しないはず）
      const updatedRecord2 = createMockRecord('record2', 43.0642, 141.3469);
      act(() => {
        store.dispatch(
          updateRecordsAction({
            layerId: 'layer1',
            userId: 'user1',
            data: [updatedRecord2],
          })
        );
      });
      rerender();

      // record1の座標は変わらない
      const unchangedCoords = result.current.targetRecord.coords;
      expect(isLocationType(unchangedCoords)).toBe(true);
      if (isLocationType(unchangedCoords)) {
        expect(unchangedCoords.latitude).toBe(35.6762);
        expect(unchangedCoords.longitude).toBe(139.6503);
      }
    });

    it('POINTタイプ以外のレイヤーでは緯度経度の更新が行われない', () => {
      const initialRecord = createMockRecord('record1', 35.6762, 139.6503);
      const lineLayer: LayerType = {
        ...mockLayer,
        type: 'LINE', // POINTではない
      };
      const store = createTestStore([initialRecord]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result } = renderHook(() => useDataEdit(initialRecord, lineLayer), { wrapper });

      // LINEタイプの場合、latlonは初期値のまま（0が設定される）
      expect(result.current.latlon.latitude.decimal).toBe('0');
      expect(result.current.latlon.longitude.decimal).toBe('0');
    });
  });

  describe('saveData関数', () => {
    it('saveData時にtargetRecordが更新される', () => {
      const initialRecord = createMockRecord('record1', 35.6762, 139.6503);
      const store = createTestStore([initialRecord]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );

      const { result } = renderHook(() => useDataEdit(initialRecord, mockLayer), { wrapper });

      // フィールドを変更
      act(() => {
        result.current.changeField('Name', 'Updated Name');
      });

      // 保存
      act(() => {
        const saveResult = result.current.saveData();
        expect(saveResult.isOK).toBe(true);
      });

      // targetRecordが更新されていることを確認
      expect(result.current.targetRecord.field.Name).toBe('Updated Name');
    });
  });
});
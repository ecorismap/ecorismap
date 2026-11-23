import { createContext } from 'react';
import { LatLonDMSType, LayerType, PhotoType, RecordType, SelectedPhotoType } from '../types';
interface DataEditContextType {
  layer: LayerType;
  data: RecordType;
  photo: SelectedPhotoType;
  isPhotoViewOpen: boolean;
  latlon: LatLonDMSType;
  isEditingRecord: boolean;
  isDecimal: boolean;
  recordNumber: number;
  maxRecordNumber: number;
  projectId: string | undefined;
  isEditable: boolean;
  /** この記録を変更できない理由（他のメンバー・テンプレートの記録など）。変更できれば undefined */
  modifyBlockMessage: string | undefined;
  /** この記録を削除できない理由。削除できれば undefined */
  deleteBlockMessage: string | undefined;
  changeLatLonType: () => void;
  changeLatLon: (val: string, latlonType: 'latitude' | 'longitude', dmsType: 'decimal' | 'deg' | 'min' | 'sec') => void;
  changeField: (name: string, value: string | number) => void;
  submitField: (name: string, format: string) => void;
  onChangeRecord: (value: number) => void;
  /** 保存の実行中（保存ボタンを無効にする） */
  isSaving?: boolean;
  /** 写真の取り込み（撮影・選択と保存）の実行中（撮影・選択・記録の切り替え・戻る・保存を止める） */
  isPhotoProcessing?: boolean;
  pressSaveData: () => void;
  pressCopyData: () => void;
  pressPhoto: (fieldName: string, photo: PhotoType, index: number) => void;
  swipePhoto: (fieldName: string, photo: PhotoType, index: number) => void;
  pressTakePhoto: (name: string) => void;
  pressPickPhoto: (name: string) => void;
  pressClosePhoto: () => void;
  pressRemovePhoto: () => void;
  pressDownloadPhoto: () => void;
  pressDeleteData: () => void;
  pressAddReferenceData: (
    referenceLayer: LayerType,
    addRecord: () => RecordType,
    fields: { [key: string]: string | number | PhotoType[] }
  ) => void;
  pressAddReferenceDataByDictionary: (
    referenceLayer: LayerType,
    addRecord: () => RecordType,
    fields: { [key: string]: string | number | PhotoType[] },
    value: string
  ) => void;
  /** 参照欄から参照先レイヤへ記録を足せないか（実行中プロジェクトのCOMMON） */
  isReferenceAddLocked: (referenceLayer: LayerType) => boolean;
  pressEditPosition: () => void;
  pressJumpToData: () => void;
  gotoGoogleMaps: () => void;
  gotoBack: () => void;
  gotoReferenceData: (referenceData: RecordType, referenceLayer: LayerType) => void;
}
export const DataEditContext = createContext({} as DataEditContextType);

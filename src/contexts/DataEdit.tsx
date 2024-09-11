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
  changeLatLonType: () => void;
  changeLatLon: (val: string, latlonType: 'latitude' | 'longitude', dmsType: 'decimal' | 'deg' | 'min' | 'sec') => void;
  changeField: (name: string, value: string | number) => void;
  submitField: (name: string, format: string) => void;
  onChangeRecord: (value: number) => void;
  pressSaveData: () => void;
  pressCopyData: () => void;
  pressPhoto: (fieldName: string, photo: PhotoType, index: number) => void;
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
  pressEditPosition: () => void;
  gotoHomeAndJump: () => void;
  gotoGoogleMaps: () => void;
  gotoBack: () => void;
  gotoReferenceData: (referenceData: RecordType, referenceLayer: LayerType) => void;
}
export const DataEditContext = createContext({} as DataEditContextType);

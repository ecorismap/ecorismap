import React, { useState, useCallback } from 'react';
// eslint-disable-next-line react-native/split-platform-components
import { Linking, Platform, PlatformIOSStatic } from 'react-native';
import { LayerType, LocationType, PhotoType, RecordType } from '../types';
import DataEdit from '../components/pages/DataEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { useDataEdit } from '../hooks/useDataEdit';
import { Props_DataEdit } from '../routes';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { useRecord } from '../hooks/useRecord';
import { DataEditContext } from '../contexts/DataEdit';
import { shallowEqual, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { useKeyboard } from '@react-native-community/hooks';
import { checkCoordsInput, checkFieldInput } from '../utils/Data';
import { pickImage, takePhoto } from '../utils/Photo';
import { PHOTO_FOLDER } from '../constants/AppConstants';

export default function DataEditContainer({ navigation, route }: Props_DataEdit) {
  //console.log(route.params.targetData);
  const [isPhotoViewOpen, setPhotoEditorOpen] = useState(false);

  const {
    targetRecord,
    targetLayer,
    latlon,
    selectedPhoto,
    isEditingRecord,
    isDecimal,
    recordNumber,
    maxRecordNumber,
    photoFolder,
    changeRecord,
    saveData,
    addPhoto,
    removePhoto,
    selectPhoto,
    deleteRecord,
    changeLatLonType,
    changeField,
    submitField,
    changeLatLon,
    cancelUpdate,
  } = useDataEdit(
    route.params.targetData,
    route.params.targetLayer,
    route.params.targetRecordSet,
    route.params.targetIndex
  );
  const projectId = useSelector((state: AppState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: AppState) => state.user);
  const { checkRecordEditable } = useRecord();
  const { keyboardShown } = useKeyboard();
  //console.log('####', targetLayer);
  //console.log('$$$$', targetRecord);

  const pressSaveData = useCallback(() => {
    const { isOK, message } = checkRecordEditable(targetLayer, targetRecord);
    if (!isOK) {
      Alert.alert('', message);
      return;
    }

    if (Platform.OS === 'ios') {
      const platformIOS = Platform as PlatformIOSStatic;
      if (!platformIOS.isPad) {
        //iPadの場合はペン入力の確定を指でおこなうとkeybordShownがtrueになるため、ここでチェックしない。
        //iPadはキーボード閉じないと保存できないので、問題はないはず。iPhoneも？
        if (keyboardShown) {
          //TABLEを入力途中で保存を押した場合、isEditingRecordがfalseになったあとに、changeFieldが走って再びTrueになる。
          //そのため入力を確定してキーボードを閉じるまで保存できないようにする。
          Alert.alert('', '入力を確定してください');
          return;
        }
      }
    }
    const checkInputResult = checkFieldInput(targetLayer, targetRecord);
    if (!checkInputResult.isOK) {
      Alert.alert('', checkInputResult.message);
      return;
    }
    if (!checkCoordsInput(latlon, isDecimal)) {
      Alert.alert('', t('hooks.message.invalidCoordinate'));
      return;
    }

    const result = saveData();
    if (!result.isOK) {
      Alert.alert('', result.message);
    }
  }, [checkRecordEditable, isDecimal, keyboardShown, latlon, saveData, targetLayer, targetRecord]);

  const pressDeleteData = useCallback(async () => {
    const ret = await ConfirmAsync(t('DataEdit.confirm.deleteData'));
    if (ret) {
      const { isOK, message } = checkRecordEditable(targetLayer, targetRecord);
      if (!isOK) {
        await AlertAsync(message);
        return;
      }
      if (isEditingRecord) saveData();
      deleteRecord();

      if (route.params.previous === 'Data') {
        navigation.navigate('Data', {
          targetLayer: { ...targetLayer },
        });
      } else if (
        route.params.previous === 'DataEdit' &&
        route.params.mainLayer !== undefined &&
        route.params.mainData !== undefined
      ) {
        navigation.navigate('DataEdit', {
          previous: 'Data',
          targetLayer: route.params.mainLayer,
          targetData: route.params.mainData,
          targetRecordSet: [],
          targetIndex: 0,
        });
      }
    }
  }, [
    checkRecordEditable,
    deleteRecord,
    isEditingRecord,
    navigation,
    route.params.mainData,
    route.params.mainLayer,
    route.params.previous,
    saveData,
    targetLayer,
    targetRecord,
  ]);

  const pressPickPhoto = useCallback(
    async (fieldName: string) => {
      const photo = await pickImage(photoFolder);
      if (photo === undefined) return;
      addPhoto(fieldName, photo);
    },
    [addPhoto, photoFolder]
  );

  const pressTakePhoto = useCallback(
    async (fieldName: string) => {
      if (Platform.OS === 'web') {
        await AlertAsync(t('DataEdit.confirm.takePhoto'));
        return;
      }
      const folder =
        projectId !== undefined
          ? `${PHOTO_FOLDER}/${projectId}/${targetLayer.id}/${user.uid}`
          : `${PHOTO_FOLDER}/LOCAL/${targetLayer.id}/OWNER`;
      const photo = await takePhoto(folder);

      if (photo === undefined) return;
      addPhoto(fieldName, photo);
    },
    [addPhoto, projectId, targetLayer.id, user.uid]
  );

  const pressPhoto = useCallback(
    (fieldName: string, photo: PhotoType, index: number) => {
      selectPhoto(fieldName, photo, index);
      setPhotoEditorOpen(true);
    },
    [selectPhoto]
  );

  const pressRemovePhoto = useCallback(async () => {
    const ret = await ConfirmAsync(t('DataEdit.confirm.removePhoto'));
    if (!ret) return;
    removePhoto(selectedPhoto);
    setPhotoEditorOpen(false);
  }, [removePhoto, selectedPhoto]);

  const pressClosePhoto = useCallback(() => {
    setPhotoEditorOpen(false);
  }, []);

  const pressDownloadPhoto = useCallback(async () => {}, []);

  const onChangeRecord = useCallback(
    async (value: number) => {
      if (isEditingRecord) {
        const ret = await ConfirmAsync(t('DataEdit.confirm.changeRecord'));
        if (ret) {
          changeRecord(value);
          cancelUpdate();
        }
      } else {
        changeRecord(value);
      }
    },
    [cancelUpdate, changeRecord, isEditingRecord]
  );

  const gotoHomeAndJump = useCallback(() => {
    let coord = { latitude: 35, longitude: 135 };
    switch (targetLayer.type) {
      case 'POINT':
        coord = targetRecord.coords as LocationType;
        break;
      case 'LINE': {
        const coords = targetRecord.coords as LocationType[];
        if (coords.length > 0) coord = targetRecord.centroid ?? coords[0];
        break;
      }
      case 'POLYGON': {
        const coords = targetRecord.coords as LocationType[];
        if (coords.length > 0) coord = targetRecord.centroid ?? coords[0];
        break;
      }
    }

    navigation.navigate('Home', {
      jumpTo: {
        latitude: coord.latitude,
        longitude: coord.longitude,
        latitudeDelta: 0.001, //デタラメな値だが,changeMapRegionで計算しなおす。svgの変換で正しい値が必要
        longitudeDelta: 0.001,
        zoom: 15,
      },
      previous: 'DataEdit',
    });
  }, [navigation, targetLayer.type, targetRecord.centroid, targetRecord.coords]);

  const gotoGoogleMaps = useCallback(() => {
    let lat = 35;
    let lng = 135;

    switch (targetLayer.type) {
      case 'POINT':
        lat = (targetRecord.coords as LocationType).latitude;
        lng = (targetRecord.coords as LocationType).longitude;
        break;
      case 'LINE': {
        const coords = targetRecord.coords as LocationType[];
        if (coords.length > 0) {
          lat = coords[0].latitude;
          lng = coords[0].longitude;
        }
        break;
      }
      case 'POLYGON': {
        const coords = targetRecord.coords as LocationType[];
        if (coords.length > 0) {
          lat = coords[0].latitude;
          lng = coords[0].longitude;
        }
        break;
      }
    }
    const label = targetRecord.field.name !== undefined ? targetRecord.field.name : '';
    const scheme = Platform.select({
      ios: 'maps:0,0?q=',
      android: 'geo:0,0?q=',
    });
    const url = Platform.select({
      ios: `${scheme}${label}@${lat},${lng}`,
      android: `${scheme}${lat},${lng}(${label})`,
      web: `https://www.google.com/maps/@${lat},${lng},15z`,
    });
    Linking.openURL(url as string);
  }, [targetLayer.type, targetRecord.coords, targetRecord.field]);

  const gotoBack = useCallback(async () => {
    const goBack = () => {
      if (route.params.previous === 'Data') {
        navigation.navigate('Data', {
          targetLayer: { ...targetLayer },
        });
      } else if (
        route.params.previous === 'DataEdit' &&
        route.params.mainLayer !== undefined &&
        route.params.mainData !== undefined
      ) {
        navigation.navigate('DataEdit', {
          previous: 'Data',
          targetLayer: route.params.mainLayer,
          targetData: route.params.mainData,
          targetRecordSet: [],
          targetIndex: 0,
        });
      }
    };
    if (isEditingRecord) {
      const ret = await ConfirmAsync(t('DataEdit.confirm.gotoBack'));
      if (ret) {
        cancelUpdate();
        goBack();
      }
    } else {
      goBack();
    }
  }, [
    cancelUpdate,
    isEditingRecord,
    navigation,
    route.params.mainData,
    route.params.mainLayer,
    route.params.previous,
    targetLayer,
  ]);

  const gotoReferenceData = useCallback(
    (referenceData: RecordType, referenceLayer: LayerType) => {
      if (isEditingRecord) {
        Alert.alert('', t('DataEdit.alert.referenceData'));
        return;
      }
      navigation.navigate('DataEdit', {
        previous: 'DataEdit',
        targetData: referenceData,
        targetLayer: referenceLayer,
        targetRecordSet: [],
        targetIndex: 0,
        mainData: targetRecord,
        mainLayer: targetLayer,
      });
    },
    [isEditingRecord, navigation, targetLayer, targetRecord]
  );

  const pressAddReferenceData = useCallback(
    (
      referenceLayer: LayerType,
      addRecord: (fields?: { [key: string]: string | number | PhotoType[] }) => RecordType,
      fields: { [key: string]: string | number | PhotoType[] }
    ) => {
      if (isEditingRecord) {
        Alert.alert('', '一旦変更を保存してください。');
        return;
      }
      //参照データを追加して、referenceKeyを設定する
      //console.log(fields);
      const referenceData = addRecord(fields);

      navigation.navigate('DataEdit', {
        previous: 'DataEdit',
        targetData: referenceData,
        targetLayer: referenceLayer,
        targetRecordSet: [],
        targetIndex: 0,
        mainData: targetRecord,
        mainLayer: targetLayer,
      });
    },
    [isEditingRecord, navigation, targetLayer, targetRecord]
  );

  return (
    <DataEditContext.Provider
      value={{
        layer: targetLayer,
        data: targetRecord,
        latlon,
        photo: selectedPhoto,
        isPhotoViewOpen,
        isEditingRecord,
        isDecimal,
        recordNumber,
        maxRecordNumber,
        pressSaveData,
        changeLatLonType,
        changeLatLon,
        changeField,
        submitField,
        onChangeRecord,
        pressPhoto,
        pressTakePhoto,
        pressPickPhoto,
        pressClosePhoto,
        pressRemovePhoto,
        pressDownloadPhoto,
        pressDeleteData,
        pressAddReferenceData,
        gotoHomeAndJump,
        gotoGoogleMaps,
        gotoBack,
        gotoReferenceData,
      }}
    >
      <DataEdit />
    </DataEditContext.Provider>
  );
}

import React, { useState, useCallback } from 'react';
// eslint-disable-next-line react-native/split-platform-components
import { Linking, Platform, PlatformIOSStatic } from 'react-native';
import { LayerType, PhotoType, RecordType } from '../types';
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
import { boundingBoxFromCoords, deltaToZoom } from '../utils/Coords';
import { useWindow } from '../hooks/useWindow';
import { isLocationType, isLocationTypeArray } from '../utils/General';

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
    copyRecord,
    changeLatLonType,
    changeField,
    submitField,
    changeLatLon,
    cancelUpdate,
  } = useDataEdit(route.params.targetData, route.params.targetLayer);
  const projectId = useSelector((state: AppState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: AppState) => state.user);
  const { checkRecordEditable } = useRecord();
  const { keyboardShown } = useKeyboard();
  const { isLandscape, windowWidth, mapRegion } = useWindow();
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

    if (route.params.previous === 'Data') {
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: targetRecord,
        targetLayer: { ...targetLayer },
      });
    } else if (
      route.params.previous === 'DataEdit' &&
      route.params.mainLayer !== undefined &&
      route.params.mainData !== undefined
    ) {
      navigation.navigate('DataEdit', {
        previous: 'DataEdit',
        targetData: targetRecord,
        targetLayer: { ...targetLayer },
        mainData: route.params.mainData,
        mainLayer: route.params.mainLayer,
      });
    }
  }, [
    checkRecordEditable,
    isDecimal,
    keyboardShown,
    latlon,
    navigation,
    route.params.mainData,
    route.params.mainLayer,
    route.params.previous,
    saveData,
    targetLayer,
    targetRecord,
  ]);

  const pressCopyData = useCallback(async () => {
    const ret = await ConfirmAsync(t('DataEdit.confirm.copyData'));
    if (!ret) return;
    const newData = copyRecord(targetRecord);
    await AlertAsync(t('DataEdit.alert.copyData'));
    if (route.params.previous === 'Data') {
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: newData,
        targetLayer: { ...targetLayer },
      });
    } else if (
      route.params.previous === 'DataEdit' &&
      route.params.mainLayer !== undefined &&
      route.params.mainData !== undefined
    ) {
      navigation.navigate('DataEdit', {
        previous: 'DataEdit',
        targetData: newData,
        targetLayer: { ...targetLayer },
        mainData: route.params.mainData,
        mainLayer: route.params.mainLayer,
      });
    }
  }, [
    copyRecord,
    navigation,
    route.params.mainData,
    route.params.mainLayer,
    route.params.previous,
    targetLayer,
    targetRecord,
  ]);

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

  const getJumpRegion = (
    targetLayer_: { type: string },
    targetRecord_: { coords: any },
    mapRegion_: { latitudeDelta: number; longitudeDelta: number; zoom: number },
    windowWidth_: number,
    isLandscape_: boolean
  ) => {
    let jumpRegion;

    if (targetLayer_.type === 'POINT') {
      if (!isLocationType(targetRecord_.coords)) return jumpRegion;
      const coord = targetRecord_.coords;
      jumpRegion = {
        latitude: coord.latitude,
        longitude: coord.longitude,
        latitudeDelta: mapRegion_.latitudeDelta,
        longitudeDelta: mapRegion_.longitudeDelta,
        zoom: mapRegion_.zoom,
      };
    } else if (targetLayer_.type === 'LINE' || targetLayer_.type === 'POLYGON') {
      if (!isLocationTypeArray(targetRecord_.coords)) return jumpRegion;
      const coords = targetRecord_.coords;
      const bounds = boundingBoxFromCoords(coords);
      const tempZoom =
        deltaToZoom(windowWidth_, {
          latitudeDelta: bounds.north - bounds.south,
          longitudeDelta: bounds.east - bounds.west,
        }).zoom - 2;
      const jumpZoom = tempZoom > 20 ? 20 : tempZoom;
      const featureWidth = bounds.east - bounds.west;
      const delta = featureWidth * 2 ** (tempZoom - jumpZoom - 1);
      jumpRegion = {
        latitude: (isLandscape_ ? 0 : -delta / 4) + (bounds.north + bounds.south) / 2,
        longitude: (isLandscape_ ? delta / 4 : 0) + (bounds.east + bounds.west) / 2,
        latitudeDelta: delta,
        longitudeDelta: delta,
        zoom: jumpZoom,
      };
    }

    return jumpRegion;
  };

  const gotoHomeAndJump = useCallback(() => {
    const jumpRegion = getJumpRegion(targetLayer, targetRecord, mapRegion, windowWidth, isLandscape);
    if (jumpRegion === undefined) return;
    navigation.navigate('Home', {
      jumpTo: jumpRegion,
      previous: 'DataEdit',
      mode: 'jumpTo',
    });
  }, [isLandscape, mapRegion, navigation, targetLayer, targetRecord, windowWidth]);

  const gotoGoogleMaps = useCallback(() => {
    let lat = 35;
    let lng = 135;

    switch (targetLayer.type) {
      case 'POINT':
        if (!isLocationType(targetRecord.coords)) return;
        lat = targetRecord.coords.latitude;
        lng = targetRecord.coords.longitude;
        break;
      case 'LINE': {
        if (!isLocationTypeArray(targetRecord.coords)) return;
        const coords = targetRecord.coords;
        if (coords.length > 0) {
          lat = coords[0].latitude;
          lng = coords[0].longitude;
        }
        break;
      }
      case 'POLYGON': {
        if (!isLocationTypeArray(targetRecord.coords)) return;
        const coords = targetRecord.coords;
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
        mainData: targetRecord,
        mainLayer: targetLayer,
      });
    },
    [isEditingRecord, navigation, targetLayer, targetRecord]
  );

  const pressEditPosition = useCallback(() => {
    if (isEditingRecord) {
      Alert.alert('', '一旦変更を保存してください。');
      return;
    }
    const { isOK, message } = checkRecordEditable(targetLayer, targetRecord);
    if (!isOK) {
      Alert.alert('', message);
      return;
    }
    const jumpRegion = getJumpRegion(targetLayer, targetRecord, mapRegion, windowWidth, isLandscape);

    navigation.navigate('Home', {
      previous: 'DataEdit',
      mode: 'editPosition',
      jumpTo: jumpRegion,
      layer: targetLayer,
      record: targetRecord,
    });
  }, [
    checkRecordEditable,
    isEditingRecord,
    isLandscape,
    mapRegion,
    navigation,
    targetLayer,
    targetRecord,
    windowWidth,
  ]);

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
        pressCopyData,
        pressAddReferenceData,
        pressEditPosition,
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

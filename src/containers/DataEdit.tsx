import React, { useState, useCallback } from 'react';
import { Linking, Platform } from 'react-native';
import { LayerType, LocationType, PhotoType, RecordType } from '../types';
import DataEdit from '../components/pages/DataEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { useDataEdit } from '../hooks/useDataEdit';
import { Props_DataEdit } from '../routes';
import { Alert } from '../components/atoms/Alert';
import { useDisplay } from '../hooks/useDisplay';
import { t } from '../i18n/config';
import { useRecord } from '../hooks/useRecord';
import { DataEditContext } from '../contexts/DataEdit';

export default function DataEditContainer({ navigation, route }: Props_DataEdit) {
  //console.log(route.params.targetData);
  const [isPhotoViewOpen, setPhotoEditorOpen] = useState(false);

  const { isDataOpened, closeData } = useDisplay();
  const {
    targetRecord,
    targetLayer,
    latlon,
    selectedPhoto,
    isEditingRecord,
    isDecimal,
    recordNumber,
    maxRecordNumber,
    changeRecord,
    saveData,
    pickImage,
    takePhoto,
    removeSelectedPhoto,
    setPhoto,
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
  const { unselectRecord } = useRecord();

  //console.log('####', targetLayer);
  //console.log('$$$$', targetRecord);

  const pressSaveData = useCallback(() => {
    const { isOK, message } = saveData();
    if (!isOK) {
      Alert.alert('', message);
    }
  }, [saveData]);

  const pressDeleteData = useCallback(async () => {
    const ret = await ConfirmAsync(t('DataEdit.confirm.deleteData'));
    if (ret) {
      const { isOK, message } = deleteRecord();
      if (!isOK) {
        Alert.alert('', message);
      } else {
        if (route.params.previous === 'Home') {
          closeData();
        } else if (route.params.previous === 'Data') {
          navigation.navigate('Data', {
            targetLayer: { ...targetLayer },
          });
        }
      }
    }
  }, [closeData, deleteRecord, navigation, route.params.previous, targetLayer]);

  const pressPickPhoto = useCallback(
    async (name: string) => {
      await pickImage(name);
    },
    [pickImage]
  );
  const pressTakePhoto = useCallback(
    async (name: string) => {
      if (Platform.OS === 'web') {
        Alert.alert('', t('DataEdit.confirm.takePhoto'));
        return;
      }
      await takePhoto(name);
    },
    [takePhoto]
  );

  const pressPhoto = useCallback(
    (fieldName: string, photo: PhotoType, index: number) => {
      setPhoto(fieldName, photo, index);
      setPhotoEditorOpen(true);
    },
    [setPhoto]
  );

  const pressRemovePhoto = useCallback(async () => {
    const ret = await ConfirmAsync(t('DataEdit.confirm.removePhoto'));
    if (ret) {
      removeSelectedPhoto();
      setPhotoEditorOpen(false);
    }
  }, [removeSelectedPhoto]);

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
        if (coords.length > 0) coord = coords[0];
        break;
      }
      case 'POLYGON': {
        const coords = targetRecord.coords as LocationType[];
        if (coords.length > 0) coord = coords[0];
        break;
      }
    }
    if (isDataOpened === 'expanded') closeData();

    setTimeout(
      () =>
        navigation.navigate('Home', {
          jumpTo: {
            latitude: coord.latitude,
            longitude: coord.longitude,
            latitudeDelta: 0.001, //デタラメな値だが,changeMapRegionで計算しなおす。svgの変換で正しい値が必要
            longitudeDelta: 0.001,
            zoom: 15,
          },
        }),
      500
    );
  }, [closeData, isDataOpened, navigation, targetLayer.type, targetRecord.coords]);

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
      } else {
        closeData();
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
    closeData,
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
    async (referenceData: RecordType | undefined, referenceLayer: LayerType, message: string) => {
      if (referenceData === undefined) {
        await AlertAsync(message);
      } else {
        navigation.navigate('DataEdit', {
          previous: 'DataEdit',
          targetData: referenceData,
          targetLayer: referenceLayer,
          targetRecordSet: [],
          targetIndex: 0,
          mainData: targetRecord,
          mainLayer: targetLayer,
        });
      }
    },
    [navigation, targetLayer, targetRecord]
  );

  const onClose = useCallback(async () => {
    if (isEditingRecord) {
      const ret = await ConfirmAsync(t('DataEdit.confirm.close'));
      if (ret) {
        cancelUpdate();
        closeData();
      }
    } else {
      closeData();
    }
    unselectRecord();
  }, [cancelUpdate, closeData, isEditingRecord, unselectRecord]);

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
        onClose,
      }}
    >
      <DataEdit />
    </DataEditContext.Provider>
  );
}

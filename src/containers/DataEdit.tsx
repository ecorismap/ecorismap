import React, { useState, useCallback, useEffect } from 'react';
import { Keyboard, Linking, Platform } from 'react-native';
import { LayerType, PhotoType, RecordType } from '../types';
import DataEdit from '../components/pages/DataEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { useDataEdit } from '../hooks/useDataEdit';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { useRecord } from '../hooks/useRecord';
import { DataEditContext } from '../contexts/DataEdit';
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux';
import { RootState } from '../store';
import { useKeyboard } from '@react-native-community/hooks';
import { checkCoordsInput, checkFieldInput, isLatLonEmpty } from '../utils/Data';
import { isPhotoPermissionDenied, pickImage, takePhoto } from '../utils/Photo';
import * as projectStorage from '../lib/firebase/storage';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { boundingBoxFromCoords, deltaToZoom } from '../utils/Coords';
import { useWindow } from '../hooks/useWindow';
import { isLocationType, isLocationTypeArray } from '../utils/General';
import { DataEditModalPhotoView } from '../components/organisms/DataEditModalPhotoView';
import { useLayers } from '../hooks/useLayers';
import { addToDynamicDictionary } from '../hooks/useDynamicDictionaryInput';
import { editSettingsAction } from '../modules/settings';
import { findLocalPhotoUri, photoDownloadTarget } from '../utils/photoDownloadPath';
import { copiedPhotosMessage } from '../utils/photoCopyMessage';
import { useSingleFlight } from '../hooks/useSingleFlight';
import { AcquiredPhoto, usePhotoAcquisition } from '../hooks/usePhotoAcquisition';
import { discardStalePickerResult } from '../utils/discardStalePickerResult';

export default function DataEditContainer() {
  const { navigate, navigateToHome } = useBottomSheetNavigation();
  const { params } = useBottomSheetRoute<'DataEdit'>();
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
    isEditable,
    modifyBlockMessage,
    deleteBlockMessage,
    addPhoto,
    updatePhoto,
    selectPhoto,
    removePhoto,
    changeRecord,
    saveData,
    deleteRecord,
    copyRecord,
    changeLatLonType,
    changeField,
    submitField,
    changeLatLon,
    cancelUpdate,
    getPhotoCaptureDraft,
  } = useDataEdit(params!.targetData, params!.targetLayer);
  const { changeActiveLayer } = useLayers();
  const dispatch = useDispatch();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user);
  const store = useStore<RootState>();
  const { checkRecordEditable, unselectRecord } = useRecord();
  const { keyboardShown } = useKeyboard();
  const { isLandscape, windowWidth, mapRegion } = useWindow();
  //console.log('####', targetLayer);
  //console.log('$$$$', targetRecord);

  //写真の取り込み（撮影・選択と保存）の実行中は、撮影・選択・記録の切り替え・戻る・保存を止める（写真監査 P-L3）
  const { isPhotoProcessing, isPhotoProcessingRef, acquirePhoto } = usePhotoAcquisition({
    recordKey: `${targetLayer.id}/${targetRecord.id}`,
    addPhoto,
  });

  //キーボードを閉じてから保存する場合の待機フラグ
  const [isSavePending, setIsSavePending] = useState(false);

  const runSave = useCallback(async () => {
    const checkInputResult = checkFieldInput(targetLayer, targetRecord);
    if (!checkInputResult.isOK) {
      Alert.alert('', checkInputResult.message);
      return;
    }
    //座標欄がすべて空欄の場合は「位置なし」として扱い座標チェックをスキップ
    //（位置なしレコードの未編集時、および位置ありレコードの位置解除時）
    const skipCoordsCheck = isLatLonEmpty(latlon, isDecimal);
    if (!skipCoordsCheck && !checkCoordsInput(latlon, isDecimal)) {
      Alert.alert('', t('hooks.message.invalidCoordinate'));
      return;
    }

    const result = await saveData();
    if (!result.isOK) {
      Alert.alert('', result.message);
      return;
    }
    //保存はできたが知らせることがある（テンプレートの写しに写せなかった写真など）
    if (result.message !== '') await AlertAsync(result.message);

    //保存に成功したら元の画面に戻る
    if (params?.previous === 'Data') {
      unselectRecord();
      navigate('Data', {
        targetLayer: { ...targetLayer },
      });
    } else if (
      params?.previous === 'DataEdit' &&
      params?.mainLayer !== undefined &&
      params?.mainData !== undefined
    ) {
      navigate('DataEdit', {
        previous: 'Data',
        targetLayer: params.mainLayer,
        targetData: params.mainData,
      });
    }
  }, [
    isDecimal,
    latlon,
    navigate,
    params?.mainData,
    params?.mainLayer,
    params?.previous,
    saveData,
    targetLayer,
    targetRecord,
    unselectRecord,
  ]);

  //保存は実行中に重ねて走らせない。テンプレートの写しでは写真のコピーを待つ間ストアが変わらないので、連打すると
  //同じ写真を二重にコピーして孤児ファイルを残す。実行中は保存ボタンも無効にする
  const { run: finalizeSave, isRunning: isSaving, isRunningRef: isSavingRef } = useSingleFlight(runSave);

  const pressSaveData = useCallback(async () => {
    if (isSavingRef.current) return;
    //取り込み中の写真はまだ記録に付いていない。保存して画面を離れると、その写真は捨てられる
    if (isPhotoProcessingRef.current) return;
    //他のメンバー・テンプレートの記録は管理者だけが変えられる（同期監査 L1）
    if (modifyBlockMessage !== undefined) {
      Alert.alert('', modifyBlockMessage);
      return;
    }
    const checkResult = checkRecordEditable(targetLayer);

    if (!checkResult.isOK) {
      if (checkResult.message === t('hooks.message.noEditMode')) {
        // 編集モードでない場合、確認ダイアログを表示
        const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
        if (!confirmResult) return;
        // 編集モードにする
        changeActiveLayer(targetLayer);
      } else {
        // その他の編集不可理由（プロジェクトロックなど）
        Alert.alert('', checkResult.message);
        return;
      }
    }

    if (Platform.OS === 'ios' && keyboardShown) {
      //保存ボタンはヘッダーにあるためタップしてもTextInputはフォーカスを失わない。
      //キーボードを閉じてonBlur（値の整形やTABLE等の確定）を走らせてから保存する。
      //iPadはペン入力の確定でもkeyboardShownがtrueになるが、その場合もフォールバックで保存される。
      Keyboard.dismiss();
      setIsSavePending(true);
      return;
    }

    finalizeSave();
  }, [
    changeActiveLayer,
    checkRecordEditable,
    finalizeSave,
    isPhotoProcessingRef,
    isSavingRef,
    keyboardShown,
    modifyBlockMessage,
    targetLayer,
  ]);

  useEffect(() => {
    if (!isSavePending) return;
    if (!keyboardShown) {
      //キーボードが閉じたらonBlurの反映後の値で保存する
      setIsSavePending(false);
      finalizeSave();
      return;
    }
    //keyboardDidHideが来ない場合（外付けキーボード、iPadのペン入力など）でも保存できるようにする
    const timer = setTimeout(() => {
      setIsSavePending(false);
      finalizeSave();
    }, 400);
    return () => clearTimeout(timer);
  }, [finalizeSave, isSavePending, keyboardShown]);

  const pressCopyData = useCallback(async () => {
    const ret = await ConfirmAsync(t('DataEdit.confirm.copyData'));
    if (!ret) return;
    const { record: newData, droppedPhotoCount, sharedPhotoCount } = await copyRecord(targetRecord);
    //写せなかった写真・元の写真を参照したままの写真があれば、黙っていずに知らせる
    await AlertAsync(
      [t('DataEdit.alert.copyData'), copiedPhotosMessage({ droppedPhotoCount, sharedPhotoCount })]
        .filter((m) => m !== '')
        .join('\n')
    );
    if (params?.previous === 'Data') {
      navigate('DataEdit', {
        previous: 'Data',
        targetData: newData,
        targetLayer: { ...targetLayer },
      });
    } else if (
      params?.previous === 'DataEdit' &&
      params?.mainLayer !== undefined &&
      params?.mainData !== undefined
    ) {
      navigate('DataEdit', {
        previous: 'DataEdit',
        targetData: newData,
        targetLayer: { ...targetLayer },
        mainData: params.mainData,
        mainLayer: params.mainLayer,
      });
    }
  }, [
    copyRecord,
    navigate,
    params?.mainData,
    params?.mainLayer,
    params?.previous,
    targetLayer,
    targetRecord,
  ]);

  const pressDeleteData = useCallback(async () => {
    //他のメンバー・テンプレートの記録は管理者だけが消せる（同期監査 M8）
    if (deleteBlockMessage !== undefined) {
      Alert.alert('', deleteBlockMessage);
      return;
    }
    const ret = await ConfirmAsync(t('DataEdit.confirm.deleteData'));
    if (ret) {
      const checkResult = checkRecordEditable(targetLayer);

      if (!checkResult.isOK) {
        if (checkResult.message === t('hooks.message.noEditMode')) {
          // 編集モードでない場合、確認ダイアログを表示
          const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
          if (!confirmResult) return;
          // 編集モードにする
          changeActiveLayer(targetLayer);
        } else {
          // その他の編集不可理由（プロジェクトロックなど）
          Alert.alert('', checkResult.message);
          return;
        }
      }

      // 編集中でも保存はしない。保存すると他のメンバーの記録は管理者の名義へ引き継がれて元の集合から移り、続く削除が
      // 元の名義に向いて空振りして、削除したつもりの記録が編集版のまま残る（同期監査 M8）。deleteRecord は保存済みの
      // 記録（ストアにある版）を消し、編集中の状態も片付ける
      const deleted = deleteRecord();
      if (!deleted.isOK) {
        Alert.alert('', deleted.message);
        return;
      }

      if (params?.previous === 'Data') {
        navigate('Data', {
          targetLayer: { ...targetLayer },
        });
      } else if (
        params?.previous === 'DataEdit' &&
        params?.mainLayer !== undefined &&
        params?.mainData !== undefined
      ) {
        navigate('DataEdit', {
          previous: 'Data',
          targetLayer: params.mainLayer,
          targetData: params.mainData,
        });
      }
    }
  }, [
    changeActiveLayer,
    checkRecordEditable,
    deleteBlockMessage,
    deleteRecord,
    navigate,
    params?.mainData,
    params?.mainLayer,
    params?.previous,
    targetLayer,
  ]);

  const pressPickPhoto = useCallback(
    async (fieldName: string) => {
      if (modifyBlockMessage !== undefined) {
        Alert.alert('', modifyBlockMessage);
        return;
      }
      await acquirePhoto(fieldName, async () => {
        await discardStalePickerResult();
        return pickImage(photoFolder);
      });
    },
    [acquirePhoto, modifyBlockMessage, photoFolder]
  );

  const pressTakePhoto = useCallback(
    async (fieldName: string) => {
      if (Platform.OS === 'web') {
        await AlertAsync(t('DataEdit.confirm.takePhoto'));
        return;
      }
      if (modifyBlockMessage !== undefined) {
        Alert.alert('', modifyBlockMessage);
        return;
      }
      const folder =
        projectId !== undefined
          ? `${PHOTO_FOLDER}/${projectId}/${targetLayer.id}/${user.uid}`
          : `${PHOTO_FOLDER}/LOCAL/${targetLayer.id}/OWNER`;
      let isPermissionDenied = false;
      const result = await acquirePhoto(fieldName, async (): Promise<AcquiredPhoto | undefined> => {
        //古い保留を先に捨てる。撮影先を残した後に捨てると、この撮影の保留と区別できなくなる
        await discardStalePickerResult();
        //Androidでカメラ起動中にActivityが破棄されると、ここには戻ってこない。
        //復帰後にusePendingPhotoCaptureが撮影結果を回収できるよう、撮影先を残しておく。
        //画面の状態（先に付けた写真や未保存の入力）も一緒に消えるので、編集中の下書きも残す
        dispatch(
          editSettingsAction({
            pendingPhotoCapture: {
              layerId: targetLayer.id,
              recordId: targetRecord.id,
              fieldName,
              draft: getPhotoCaptureDraft(),
            },
          })
        );
        const photo = await takePhoto(folder);
        dispatch(editSettingsAction({ pendingPhotoCapture: undefined }));
        if (isPhotoPermissionDenied(photo)) {
          isPermissionDenied = true;
          return undefined;
        }
        return photo;
      });

      if (result === 'none' && isPermissionDenied) {
        //拒否したままだと何度押しても何も起きないので、理由を伝えて設定画面へ案内する
        const ret = await ConfirmAsync(t('DataEdit.alert.permitCamera'), {
          true: t('DataEdit.label.openSettings'),
          false: t('common.cancel'),
        });
        if (ret) Linking.openSettings().catch(() => undefined);
      }
    },
    [acquirePhoto, dispatch, getPhotoCaptureDraft, modifyBlockMessage, projectId, targetLayer.id, targetRecord.id, user.uid]
  );

  const pressPhoto = useCallback(
    async (fieldName: string, photo: PhotoType, index: number) => {
      //選択（ファイル確認を含む）が終わってから開く。先に開くと前回表示していた写真の位置で開いてしまう
      await selectPhoto(fieldName, photo, index);
      setPhotoEditorOpen(true);
    },
    [selectPhoto]
  );

  //写真表示中にスワイプで隣の写真へ移ったとき。削除・ダウンロードの対象を移った先の写真にする
  const swipePhoto = useCallback(
    (fieldName: string, photo: PhotoType, index: number) => {
      selectPhoto(fieldName, photo, index);
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

  const pressDownloadPhoto = useCallback(async () => {
    const ret = await ConfirmAsync(t('DataEdit.confirm.downloadPhoto'));
    if (ret) {
      // if (!hasOpened(projectId)) {
      //   Alert.alert('', t('hooks.message.openProject'));
      //   return;
      // }

      const { url, key, name, fieldName, index, id } = selectedPhoto;
      if (url === null || key === null) {
        await AlertAsync(t('hooks.message.unknownURL'));
        return;
      }
      // 他人の記録の写真は持ち主のフォルダに id 付きの名前で置く（同じ秒に撮った別人の写真とすり替わらないように）
      const target =
        projectId !== undefined && user.uid !== undefined
          ? photoDownloadTarget({
              projectId,
              layerId: targetLayer.id,
              ownUid: user.uid,
              recordUserId: targetRecord.userId,
              photoId: id,
              photoName: name,
              photoUrl: url,
              // 記録の uri は同期で届いた送り手の端末のパスのことがあるので、手元の記録で確かめた uri だけを渡す（写真監査 P-L15）
              localPhotoUri: findLocalPhotoUri(store.getState().dataSet, targetLayer.id, id),
            })
          : { folder: photoFolder, filename: name };
      if (target === undefined) {
        await AlertAsync(t('firebase.message.failGetPhoto'));
        return;
      }
      const { isOK, message, uri } = await projectStorage.downloadPhoto(url, key, target.filename, target.folder, {
        photoId: id,
        reuseExisting: 'reuseExisting' in target ? target.reuseExisting : undefined,
      });
      if (!isOK || uri === null) {
        await AlertAsync(message);
        return;
      }
      updatePhoto(fieldName, index, uri);
    }
    setPhotoEditorOpen(false);
  }, [photoFolder, projectId, selectedPhoto, store, targetLayer.id, targetRecord.userId, updatePhoto, user.uid]);

  const onChangeRecord = useCallback(
    async (value: number) => {
      if (isPhotoProcessingRef.current) return;
      if (isEditingRecord) {
        const ret = await ConfirmAsync(t('DataEdit.confirm.changeRecord'));
        if (!ret) return;
      }
      if (value > maxRecordNumber) {
        //使用するか検討中
        //await pressAddData();
      } else {
        changeRecord(value);
        cancelUpdate();
      }
    },
    [cancelUpdate, changeRecord, isEditingRecord, isPhotoProcessingRef, maxRecordNumber]
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
      if (coord.latitude === 0 && coord.longitude === 0) return jumpRegion;
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
      const tempZoom = deltaToZoom(windowWidth_, {
        latitudeDelta: bounds.north - bounds.south,
        longitudeDelta: bounds.east - bounds.west,
      }).zoom;
      const jumpZoom = tempZoom > 20 ? 20 : tempZoom;
      const featureWidth = bounds.east - bounds.west;
      const delta = featureWidth * 2 ** (tempZoom - jumpZoom);
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

  const pressJumpToData = useCallback(() => {
    const jumpRegion = getJumpRegion(targetLayer, targetRecord, mapRegion, windowWidth, isLandscape);
    if (jumpRegion === undefined) return;
    navigateToHome?.({
      jumpTo: jumpRegion,
      previous: 'DataEdit',
      mode: 'jumpTo',
    });
  }, [isLandscape, mapRegion, navigateToHome, targetLayer, targetRecord, windowWidth]);

  const gotoGoogleMaps = useCallback(async () => {
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

    const label = (targetRecord.field.name !== undefined ? targetRecord.field.name : '') as string;
    const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    let url: string;

    if (Platform.OS === 'ios') {
      url = fallbackUrl;
    } else if (Platform.OS === 'android') {
      // Android用はgeoスキームでGoogle Mapsの動作を期待（Google Mapsがデフォルトの場合）
      url = `geo:0,0?q=${lat},${lng}(${encodeURIComponent(label)})`;
    } else {
      url = fallbackUrl;
    }

    try {
      await Linking.openURL(url);
    } catch (error) {
      // 地図を開く際にエラーが発生しました
    }
  }, [targetLayer.type, targetRecord.coords, targetRecord.field]);

  const gotoBack = useCallback(async () => {
    if (isPhotoProcessingRef.current) return;
    const goBack = () => {
      if (params?.previous === 'Data') {
        unselectRecord();
        navigate('Data', {
          targetLayer: { ...targetLayer },
        });
      } else if (
        params?.previous === 'DataEdit' &&
        params?.mainLayer !== undefined &&
        params?.mainData !== undefined
      ) {
        navigate('DataEdit', {
          previous: 'Data',
          targetLayer: params.mainLayer,
          targetData: params.mainData,
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
    isPhotoProcessingRef,
    navigate,
    params?.mainData,
    params?.mainLayer,
    params?.previous,
    targetLayer,
    unselectRecord,
  ]);

  const gotoReferenceData = useCallback(
    (referenceData: RecordType, referenceLayer: LayerType) => {
      if (isEditingRecord) {
        Alert.alert('', t('DataEdit.alert.referenceData'));
        return;
      }
      navigate('DataEdit', {
        previous: 'DataEdit',
        targetData: referenceData,
        targetLayer: referenceLayer,
        mainData: targetRecord,
        mainLayer: targetLayer,
      });
    },
    [isEditingRecord, navigate, targetLayer, targetRecord]
  );

  const pressAddReferenceData = useCallback(
    (
      referenceLayer: LayerType,
      addRecord: (fields?: { [key: string]: string | number | PhotoType[] }) => RecordType,
      fields: { [key: string]: string | number | PhotoType[] }
    ) => {
      if (isEditingRecord) {
        Alert.alert('', t('DataEdit.alert.saveChangesFirst'));
        return;
      }
      //参照データを追加して、referenceKeyを設定する
      //console.log(fields);
      const referenceData = addRecord(fields);

      navigate('DataEdit', {
        previous: 'DataEdit',
        targetData: referenceData,
        targetLayer: referenceLayer,
        mainData: targetRecord,
        mainLayer: targetLayer,
      });
    },
    [isEditingRecord, navigate, targetLayer, targetRecord]
  );

  const pressEditPosition = useCallback(async () => {
    if (isEditingRecord) {
      Alert.alert('', t('DataEdit.alert.saveChangesFirst'));
      return;
    }
    if (modifyBlockMessage !== undefined) {
      Alert.alert('', modifyBlockMessage);
      return;
    }
    const checkResult = checkRecordEditable(targetLayer);

    if (!checkResult.isOK) {
      if (checkResult.message === t('hooks.message.noEditMode')) {
        // 編集モードでない場合、確認ダイアログを表示
        const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
        if (!confirmResult) return;
        // 編集モードにする
        changeActiveLayer(targetLayer);
      } else {
        // その他の編集不可理由（プロジェクトロックなど）
        Alert.alert('', checkResult.message);
        return;
      }
    }
    const jumpRegion = getJumpRegion(targetLayer, targetRecord, mapRegion, windowWidth, isLandscape);

    navigateToHome?.({
      previous: 'DataEdit',
      mode: 'editPosition',
      jumpTo: jumpRegion,
      layer: targetLayer,
      record: targetRecord,
      withCoord: jumpRegion !== undefined,
    });
  }, [
    changeActiveLayer,
    checkRecordEditable,
    isEditingRecord,
    isLandscape,
    mapRegion,
    modifyBlockMessage,
    navigateToHome,
    targetLayer,
    targetRecord,
    windowWidth,
  ]);

  const pressAddReferenceDataByDictionary = useCallback(
    (
      referenceLayer: LayerType,
      addRecord: (fields?: { [key: string]: string | number | PhotoType[] }) => RecordType,
      fields: { [key: string]: string | number | PhotoType[] },
      text: string
    ) => {
      if (isEditingRecord) {
        Alert.alert('', t('DataEdit.alert.saveChangesFirst'));
        return;
      }
      const dictionaryField = referenceLayer.field.find((f) => f.id === referenceLayer.dictionaryFieldId);
      const fieldName = dictionaryField?.name;
      if (!fieldName) return;
      // 動的辞書はデータ保存時に語彙が蓄積されるが、この追加経路は保存を経ないため即時登録する
      if (dictionaryField?.format === 'STRING_DYNAMIC') {
        addToDynamicDictionary(`${referenceLayer.id}_${referenceLayer.dictionaryFieldId}`, text);
      }
      addRecord({ ...fields, [fieldName]: text });
    },
    [isEditingRecord]
  );
  const dataEditContextValue = React.useMemo(
    () => ({
      layer: targetLayer,
      data: targetRecord,
      latlon,
      photo: selectedPhoto,
      isPhotoViewOpen,
      isEditingRecord,
      isDecimal,
      recordNumber,
      maxRecordNumber,
      projectId,
      isEditable,
      modifyBlockMessage,
      deleteBlockMessage,
      isSaving,
      isPhotoProcessing,
      pressSaveData,
      changeLatLonType,
      changeLatLon,
      changeField,
      submitField,
      onChangeRecord,
      pressPhoto,
      swipePhoto,
      pressTakePhoto,
      pressPickPhoto,
      pressClosePhoto,
      pressRemovePhoto,
      pressDownloadPhoto,
      pressDeleteData,
      pressCopyData,
      pressAddReferenceData,
      pressAddReferenceDataByDictionary,
      pressEditPosition,
      pressJumpToData,
      gotoGoogleMaps,
      gotoBack,
      gotoReferenceData,
    }),
    [
      changeField,
      changeLatLon,
      changeLatLonType,
      gotoBack,
      gotoGoogleMaps,
      gotoReferenceData,
      isDecimal,
      isEditingRecord,
      isPhotoViewOpen,
      isPhotoProcessing,
      isSaving,
      latlon,
      maxRecordNumber,
      isEditable,
      modifyBlockMessage,
      deleteBlockMessage,
      onChangeRecord,
      pressAddReferenceData,
      pressAddReferenceDataByDictionary,
      pressClosePhoto,
      pressCopyData,
      pressDeleteData,
      pressDownloadPhoto,
      pressEditPosition,
      pressJumpToData,
      pressPhoto,
      pressPickPhoto,
      pressRemovePhoto,
      pressSaveData,
      pressTakePhoto,
      projectId,
      recordNumber,
      selectedPhoto,
      submitField,
      swipePhoto,
      targetLayer,
      targetRecord,
    ]
  );

  return (
    <DataEditContext.Provider value={dataEditContextValue}>
      <DataEdit />
      <DataEditModalPhotoView />
    </DataEditContext.Provider>
  );
}

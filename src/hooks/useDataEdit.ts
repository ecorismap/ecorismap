import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { DMSKey, LatLonDMSKey, LatLonDMSType, LayerType, PhotoType, RecordType, SelectedPhotoType } from '../types';
import { RootState } from '../store';
import { addRecordsAction, deleteRecordsAction, moveRecordsToUserAction, updateRecordsAction } from '../modules/dataSet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LatLonDMSEmptyTemplate, LatLonDMSTemplate, PHOTO_FOLDER, SelectedPhotoTemplate } from '../constants/AppConstants';
import { cloneDeep } from 'lodash';
import { latLonDMS, toLatLonDMS } from '../utils/Coords';
import { formattedInputs } from '../utils/Format';
import { updateRecordCoords, updateReferenceFieldValue } from '../utils/Data';
import { useRecord } from './useRecord';
import { ulid } from 'ulid';
import { deleteLocalPhoto, deleteRecordPhotos, hasLocalPhotoFile } from '../utils/Photo';
import { useBottomSheetNavigation } from '../contexts/BottomSheetNavigationContext';
import { isLocationType } from '../utils/General';
import { resolveCodeField, toCodeFieldValue } from '../utils/Layer';
import { selectNonDeletedDataSet, selectNonDeletedAllUserRecordSet } from '../modules/selectors';
import { useProject } from './useProject';
import { addToDynamicDictionary } from './useDynamicDictionaryInput';
import { usePermission } from './usePermission';
import { t } from '../i18n/config';
import { getRecordModifyBlock, RecordModifyAction, recordModifyBlockMessageKey } from '../utils/recordTakeover';

export type UseDataEditReturnType = {
  targetRecord: RecordType;
  targetLayer: LayerType;
  latlon: LatLonDMSType;
  selectedPhoto: SelectedPhotoType;
  isEditingRecord: boolean;
  isDecimal: boolean;
  recordNumber: number;
  maxRecordNumber: number;
  photoFolder: string;
  isEditable: boolean;
  /** この記録を変更できない理由（他のメンバー・テンプレートの記録で、管理者でないときなど）。変更できれば undefined */
  modifyBlockMessage: string | undefined;
  /** この記録を削除できない理由。削除できれば undefined */
  deleteBlockMessage: string | undefined;
  changeRecord: (value: number) => void;
  saveData: () => {
    isOK: boolean;
    message: string;
  };
  addPhoto: (
    fieldName: string,
    photo: {
      uri: string;
      thumbnail: string | null;
      width: number | undefined;
      height: number | undefined;
      name: string;
    }
  ) => void;
  updatePhoto: (fieldName: string, index: number, uri: string) => void;
  removePhoto: (photo: SelectedPhotoType) => void;
  selectPhoto: (fieldName: string, photo: PhotoType, index: number) => Promise<void>;
  deleteRecord: () => { isOK: boolean; message: string };
  copyRecord: (originalRecord: RecordType) => RecordType;
  changeLatLonType: () => void;
  changeField: (name: string, value: string | number) => void;
  submitField: (name: string, format: string) => void;
  changeLatLon: (val: string, latlonType: LatLonDMSKey, dmsType: DMSKey) => void;
  cancelUpdate: () => void;
};

export const useDataEdit = (record: RecordType, layer: LayerType): UseDataEditReturnType => {
  const dispatch = useDispatch();
  const { isSettingProject } = useProject();
  const { isOwnerAdmin, isRunningProject } = usePermission();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user);
  const isEditingRecord = useSelector((state: RootState) => state.settings.isEditingRecord, shallowEqual);
  const dataSet = useSelector(selectNonDeletedDataSet);
  const allUserRecordSet = useSelector((state: RootState) => selectNonDeletedAllUserRecordSet(state, layer.id));
  const [targetLayer, setTargetLayer] = useState<LayerType>(layer);
  const [targetRecord, setTargetRecord] = useState<RecordType>(record);
  const [targetRecordSet, setTargetRecordSet] = useState<RecordType[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhotoType>(SelectedPhotoTemplate);
  const [latlon, setLatLon] = useState<LatLonDMSType>(LatLonDMSTemplate);
  //座標欄をユーザーが編集したかどうか。位置なしレコードへのテンプレート値書き込み防止に使う。
  const [isLatLonDirty, setIsLatLonDirty] = useState(false);
  const [recordNumber, setRecordNumber] = useState(1);
  const [isDecimal, setIsDecimal] = useState(true);
  const [temporaryDeletePhotoList, setTemporaryDeletePhotoList] = useState<{ photoId: string; uri: string }[]>([]);
  const [temporaryAddedPhotoList, setTemporaryAddedPhotoList] = useState<{ photoId: string; uri: string }[]>([]);

  const { selectRecord, setIsEditingRecord } = useRecord();
  const { currentScreen } = useBottomSheetNavigation();

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const photoFolder = useMemo(
    () =>
      projectId !== undefined
        ? `${PHOTO_FOLDER}/${projectId}/${targetLayer.id}/${dataUser.uid}`
        : `${PHOTO_FOLDER}/LOCAL/${targetLayer.id}/OWNER`,
    [dataUser.uid, projectId, targetLayer.id]
  );

  const isMapMemoLayer = useMemo(
    () =>
      dataSet.flatMap((d) => (d.layerId === layer.id ? d.data : [])).some((d) => d.field._strokeColor !== undefined),
    [dataSet, layer.id]
  );
  const isClosedProject = projectId === undefined;
  const isEditable = useMemo(
    () => isClosedProject || isSettingProject || targetLayer.permission !== 'COMMON',
    [isClosedProject, isSettingProject, targetLayer.permission]
  );

  const maxRecordNumber = targetRecordSet.length;

  //他のメンバー・テンプレートの記録を変更・削除できるのは管理者だけ（同期監査 M8・L1。utils/recordTakeover）
  const recordModifyBlockMessage = useCallback(
    (action: RecordModifyAction) => {
      const block = getRecordModifyBlock({
        layer: targetLayer,
        recordUserId: targetRecord.userId,
        action,
        ownUserId: dataUser.uid,
        isOwnerAdmin,
        isRunningProject,
      });
      return block === undefined ? undefined : t(recordModifyBlockMessageKey(block));
    },
    [dataUser.uid, isOwnerAdmin, isRunningProject, targetLayer, targetRecord.userId]
  );
  const modifyBlockMessage = useMemo(() => recordModifyBlockMessage('edit'), [recordModifyBlockMessage]);
  const deleteBlockMessage = useMemo(() => recordModifyBlockMessage('delete'), [recordModifyBlockMessage]);

  useEffect(() => {
    //changeRecordが呼ばれた場合、targetRecordを変更する
    if (currentScreen.name !== 'DataEdit') return;

    //recordNumberが変更された場合、targetRecordを変更する
    //部分消去などでレコード数が減っていると範囲外になり得るため、その場合は何もしない
    const newRecord = allUserRecordSet[recordNumber - 1];
    if (newRecord === undefined) return;
    selectRecord(targetLayer.id, newRecord);
    setTargetRecord(newRecord);
    setTargetRecordSet(allUserRecordSet);
    setTargetLayer(layer);
    if (layer.type === 'POINT') {
      const newLatLon = isLocationType(newRecord.coords) ? toLatLonDMS(newRecord.coords) : LatLonDMSEmptyTemplate;
      setLatLon(newLatLon);
      setIsLatLonDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordNumber]);

  useEffect(() => {
    //recordが変更された場合、targetRecordを変更する
    if (currentScreen.name !== 'DataEdit') return;

    // allUserRecordSetをセレクタから取得
    const initialRecordNumber = allUserRecordSet.findIndex((d) => d.id === record.id) + 1;
    selectRecord(targetLayer.id, record);
    setTargetRecord(record);
    setTargetRecordSet(allUserRecordSet);
    setTargetLayer(layer);
    setRecordNumber(initialRecordNumber);
    if (layer.type === 'POINT') {
      const newLatLon = isLocationType(record.coords) ? toLatLonDMS(record.coords) : LatLonDMSEmptyTemplate;
      setLatLon(newLatLon);
      setIsLatLonDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  // Reduxストアのデータが更新された際に緯度経度を更新
  useEffect(() => {
    if (currentScreen.name !== 'DataEdit') return;
    if (!targetRecord || !targetRecord.id) return;

    // Reduxストアから最新のレコードを取得
    const updatedRecord = allUserRecordSet.find((d) => d.id === targetRecord.id);
    //参照が同じなら未変更（immerは未変更レコードの参照を保持）。JSON比較のコストを避ける
    if (updatedRecord === targetRecord) return;
    if (updatedRecord && layer.type === 'POINT') {
      const newLatLon = isLocationType(updatedRecord.coords) ? toLatLonDMS(updatedRecord.coords) : LatLonDMSEmptyTemplate;
      // 緯度経度が変更されている場合のみ更新
      if (JSON.stringify(newLatLon) !== JSON.stringify(latlon)) {
        setLatLon(newLatLon);
        setIsLatLonDirty(false);
        setTargetRecord(updatedRecord);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUserRecordSet]);

  // コンポーネントがアンマウントされるときにisEditingRecordをリセット
  useEffect(() => {
    return () => {
      setIsEditingRecord(false);
    };
  }, [setIsEditingRecord]);

  const changeRecord = useCallback(
    (value: number) => {
      if (targetRecordSet.length === 0) return;

      setRecordNumber(value);
    },
    [targetRecordSet]
  );

  const removePhoto = useCallback(
    (photo: SelectedPhotoType) => {
      if (photo.uri) {
        const addedPhoto = temporaryAddedPhotoList.find(({ photoId }) => photoId === photo.id);
        if (addedPhoto === undefined) {
          setTemporaryDeletePhotoList([...temporaryDeletePhotoList, { photoId: photo.id, uri: photo.uri }]);
        } else {
          //一旦追加したものを削除する場合
          const updatedList = temporaryAddedPhotoList.filter(({ photoId }) => photoId !== photo.id);
          setTemporaryAddedPhotoList(updatedList);
        }
      }
      const m = cloneDeep(targetRecord);
      const photos = m.field[photo.fieldName] as PhotoType[];
      if (projectId === undefined) {
        photos.splice(photo.index, 1);
      } else {
        //アップロードする際に削除すべきものはuriをundefinedにする
        photos[photo.index] = { ...photo, uri: undefined };
      }

      setSelectedPhoto({} as SelectedPhotoType);
      setTargetRecord(m);
      setIsEditingRecord(true);
    },
    [projectId, setIsEditingRecord, targetRecord, temporaryAddedPhotoList, temporaryDeletePhotoList]
  );

  const selectPhoto = useCallback(async (fieldName: string, photo: PhotoType, index: number) => {
    const hasLocal = await hasLocalPhotoFile(photo.uri);
    setSelectedPhoto({ ...photo, hasLocal, index: index, fieldName: fieldName });
  }, []);

  const addPhoto = useCallback(
    (
      fieldName: string,
      photo: {
        uri: string;
        thumbnail: string | null;
        width: number | undefined;
        height: number | undefined;
        name: string;
      }
    ) => {
      //console.log('$$$', uri);
      const updatedRecord = cloneDeep(targetRecord);
      const photoId = ulid();
      const photoField = updatedRecord.field[fieldName] as PhotoType[];
      photoField.push({
        id: photoId,
        name: photo.name,
        url: null,
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        thumbnail: photo.thumbnail,
        key: null,
      } as PhotoType);

      //console.log(m.field[name]);
      setTargetRecord(updatedRecord);
      setIsEditingRecord(true);
      setTemporaryAddedPhotoList([...temporaryAddedPhotoList, { photoId, uri: photo.uri }]);
    },
    [setIsEditingRecord, targetRecord, temporaryAddedPhotoList]
  );

  const saveData = useCallback(() => {
    //他のメンバー・テンプレートの記録を変えてよいか（同期監査 L1）。だめなら何も変えずに理由を返す
    if (modifyBlockMessage !== undefined) return { isOK: false, message: modifyBlockMessage };
    temporaryDeletePhotoList.forEach(({ uri }) => deleteLocalPhoto(uri));
    setTemporaryDeletePhotoList([]);
    setTemporaryAddedPhotoList([]);
    const updatedField = updateReferenceFieldValue(targetLayer, targetRecord.field, targetRecord.id);
    const fieldUpdatedRecord = { ...targetRecord, field: updatedField };

    const updatedRecord = updateRecordCoords(fieldUpdatedRecord, latlon, isDecimal, isLatLonDirty);
    //unixTimeを更新
    updatedRecord.updatedAt = Date.now();

    // STRING_DYNAMICフィールドの値を辞書に追加
    targetLayer.field.forEach((field) => {
      if (field.format === 'STRING_DYNAMIC' && updatedRecord.field[field.name]) {
        const fieldValue = updatedRecord.field[field.name];
        if (typeof fieldValue === 'string' || typeof fieldValue === 'number') {
          const fieldKey = `${targetLayer.id}_${field.id}`;
          addToDynamicDictionary(fieldKey, fieldValue);
        }
      }
    });

    //データの更新。userIdが変更される場合は、元の集合から自分の集合へ持ち替える
    //（他のメンバーの記録は、ストアの所有権の規則 modules/recordOwnership が管理者なら引き継ぎにする）
    if (targetRecord.userId !== dataUser.uid) {
      dispatch(
        moveRecordsToUserAction({
          layerId: targetLayer.id,
          fromUserId: targetRecord.userId,
          toUserId: dataUser.uid,
          toDisplayName: dataUser.displayName,
          data: [updatedRecord],
        })
      );
    } else {
      updatedRecord.userId = dataUser.uid;
      updatedRecord.displayName = dataUser.displayName;
      dispatch(
        updateRecordsAction({
          layerId: targetLayer.id,
          userId: dataUser.uid,
          data: [updatedRecord],
        })
      );
    }

    setIsEditingRecord(false);
    setIsLatLonDirty(false);
    return { isOK: true, message: '' };
  }, [
    modifyBlockMessage,
    temporaryDeletePhotoList,
    targetLayer,
    targetRecord,
    latlon,
    isDecimal,
    isLatLonDirty,
    dataUser.uid,
    dataUser.displayName,
    dispatch,
    setIsEditingRecord,
  ]);

  const updatePhoto = useCallback(
    (fieldName: string, index: number, uri: string) => {
      const updatedRecord = cloneDeep(targetRecord);
      (updatedRecord.field[fieldName] as PhotoType[])[index].uri = uri;
      setTargetRecord(updatedRecord);
      //編集中でなければ、保存する。ユーザーは変更しない。
      if (!isEditingRecord) {
        dispatch(
          updateRecordsAction({
            layerId: targetLayer.id,
            userId: updatedRecord.userId,
            data: [updatedRecord],
          })
        );
      }
    },
    [dispatch, isEditingRecord, targetLayer.id, targetRecord]
  );

  const deleteRecord = useCallback(() => {
    //他のメンバー・テンプレートの記録を消してよいか（同期監査 M8）。だめなら写真も含めて何も消さずに理由を返す
    if (deleteBlockMessage !== undefined) return { isOK: false, message: deleteBlockMessage };
    //編集中のまま消すときは、編集を保存せずに元の記録を消す。写真は、編集で足したもの（targetRecord に入っている）と
    //編集で外したもの（temporaryDeletePhotoList。保存済みの記録にはまだ入っている）の両方を消す
    deleteRecordPhotos(targetLayer, targetRecord);
    temporaryDeletePhotoList.forEach(({ uri }) => deleteLocalPhoto(uri));
    setTemporaryDeletePhotoList([]);
    setTemporaryAddedPhotoList([]);

    let deletedRecords: RecordType[] = [];
    if (isMapMemoLayer) {
      //同じグループのレコードを取得
      const subGroupRecords = dataSet
        .flatMap((d) => (d.layerId === layer.id ? d.data : []))
        .filter((d) => d.field._group === targetRecord.id);
      deletedRecords = [targetRecord, ...subGroupRecords];
    } else {
      deletedRecords = [targetRecord];
    }

    dispatch(
      deleteRecordsAction({
        layerId: targetLayer.id,
        userId: targetRecord.userId,
        data: deletedRecords,
      })
    );
    setIsEditingRecord(false);
    setIsLatLonDirty(false);
    return { isOK: true, message: '' };
  }, [
    deleteBlockMessage,
    targetLayer,
    targetRecord,
    temporaryDeletePhotoList,
    isMapMemoLayer,
    dispatch,
    dataSet,
    layer.id,
    setIsEditingRecord,
  ]);

  const changeField = useCallback(
    (name: string, value: string | number) => {
      //値はstring/numberなので浅コピーで十分。cloneDeepだと写真配列を含むレコードでキー入力ごとに重くなる
      if (targetRecord.field[name] !== value) {
        const field = { ...targetRecord.field, [name]: value };
        //レイヤ設定で「コードの入れ先」を決めてある選択肢は、コードも一緒に書き換える。
        //コードの無い選択肢や「その他」は空にする（前のコードが残ると表記と実体が食い違うため）
        const changedField = targetLayer.field.find((f) => f.name === name);
        const codeField = changedField === undefined ? undefined : resolveCodeField(targetLayer, changedField);
        if (changedField !== undefined && codeField !== undefined) {
          const item = changedField.list?.find((i) => !i.isOther && i.value === value);
          field[codeField.name] = toCodeFieldValue(item?.customFieldValue, codeField.format);
        }
        const m = { ...targetRecord, field };
        setTargetRecord(m);
        setIsEditingRecord(true);
      }
    },
    [setIsEditingRecord, targetLayer, targetRecord]
  );

  const submitField = useCallback(
    (name: string, format: string) => {
      //console.log(targetRecord.field[name]);
      const formatted = formattedInputs(targetRecord.field[name], format);
      const m = { ...targetRecord, field: { ...targetRecord.field, [name]: formatted.result } };
      setTargetRecord(m);
    },
    [targetRecord]
  );

  const changeLatLonType = useCallback(() => {
    //位置なし（空欄）の場合は変換するとNaNになるため、表示形式のみ切り替える
    const isEmpty =
      latlon.latitude.decimal === '' &&
      latlon.longitude.decimal === '' &&
      latlon.latitude.deg === '' &&
      latlon.longitude.deg === '';
    if (isEmpty) {
      setIsDecimal(!isDecimal);
      return;
    }
    const latLonDms = latLonDMS(latlon, isDecimal);
    setLatLon(latLonDms);
    setIsDecimal(!isDecimal);
  }, [isDecimal, latlon]);

  const changeLatLon = useCallback(
    (val: string, latlonType: LatLonDMSKey, dmsType: DMSKey) => {
      const newLatLon = cloneDeep(latlon);
      newLatLon[latlonType][dmsType] = val;
      setLatLon(newLatLon);
      setIsLatLonDirty(true);
      setIsEditingRecord(true);
    },
    [latlon, setIsEditingRecord]
  );

  const cancelUpdate = useCallback(() => {
    setIsEditingRecord(false);
    temporaryAddedPhotoList.forEach(({ uri }) => deleteLocalPhoto(uri));
    setTemporaryDeletePhotoList([]);
    setTemporaryAddedPhotoList([]);
  }, [setIsEditingRecord, temporaryAddedPhotoList]);

  const copyRecord = useCallback(
    (originalRecord: RecordType) => {
      const id = ulid();

      //複製は新しい id の自分の記録なので、元の記録の引き継ぎ元（takenOverFrom）は持ち越さない
      const { takenOverFrom: _takenOverFrom, ...rest } = originalRecord;
      const newData: RecordType = {
        ...rest,
        id: id,
        userId: dataUser.uid,
        displayName: dataUser.displayName,
        updatedAt: Date.now(),
      };
      dispatch(addRecordsAction({ layerId: targetLayer.id, userId: dataUser.uid, data: [newData] }));
      return newData;
    },
    [targetLayer, dataUser.uid, dataUser.displayName, dispatch]
  );

  return {
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
    removePhoto,
    selectPhoto,
    updatePhoto,
    changeRecord,
    deleteRecord,
    changeLatLonType,
    changeField,
    submitField,
    changeLatLon,
    cancelUpdate,
    copyRecord,
    saveData,
  } as const;
};

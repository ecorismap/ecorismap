import { useCallback, useEffect, useMemo, useState } from 'react';
import { ColorStyle, FeatureType, FieldType, FormatType, LayerType, PermissionType, ToolPaletteType } from '../types';
import { COLOR, PHOTO_FOLDER } from '../constants/AppConstants';
import { getUserColor } from '../utils/Color';

import { cloneDeep } from 'lodash';
import { ulid } from 'ulid';
import { t } from '../i18n/config';
import { findHisyouField, HISYOU_FIELDS } from '../constants/ToolPalette';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { formattedInputs } from '../utils/Format';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { addDataAction, deleteDataAction, updateDataAction } from '../modules/dataSet';
import { addLayerAction, deleteLayerAction, setLayersAction, updateLayerAction } from '../modules/layers';
import { editSettingsAction, setDataFilterForLayerAction } from '../modules/settings';
import { changeFieldValue, countFieldValuesLostOnFormatChange, getBlankFieldValue } from '../utils/Data';
import { LAYER_PRESETS, PRESET_LAYER_DATA } from '../constants/Presets';
import { createLayerFromPreset, PresetDictionary } from '../utils/Preset';
import { geoJson2Data } from '../utils/Geometry';
import {
  adaptDefaultValueToFormat,
  applyColorStyle,
  getRenamedOrRetypedFieldNames,
  parseNumberDefaultValue,
  hasCodeLink,
  isCodeTargetFormat,
  renameRecordFields,
  restoreColorStyleFromIndividual,
  updateFieldReferences,
} from '../utils/Layer';
import type { FeatureCollection } from 'geojson';
import { importPresetDictionaries } from '../utils/PresetDictionary';
import sanitize from 'sanitize-filename';
import { selectDataSet, selectIsNewLayer } from '../modules/selectors';
import { isSafePathSegment } from '../utils/safePath';

export type UseLayerEditReturnType = {
  targetLayer: LayerType;
  isEdited: boolean;
  isNewLayer: boolean;
  canChangePermission: boolean;
  /** 共有プロジェクトで名前か型を変えた既存属性（変更前の名前）。メンバーのクラウドデータは移行されないので保存前に警告する */
  unmigratedCloudFieldNames: string[];
  /** 形式の変更で消える・変わる既存の値の件数。個人・共有を問わず保存前に確認する */
  lostFieldValueCount: number;
  saveLayer: () => void;
  deleteLayer: () => Promise<void>;
  deleteLayerPhotos: () => Promise<void>;
  changeLayerName: (val: string) => void;
  submitLayerName: () => void;
  changeFeatureType: (itemValue: FeatureType) => void;
  changeToolPalette: (value: ToolPaletteType | undefined) => void;
  changePermission: (val: PermissionType) => void;
  changeFieldOrder: (index: number, direction: 'up' | 'down') => void;
  changeFieldName: (index: number, val: string) => void;
  changeOption: (index: number, val: boolean) => void;
  submitFieldName: (index: number) => void;
  changeFieldFormat: (index: number, itemValue: FormatType) => void;
  deleteField: (id: number) => void;
  addField: () => void;
  applyLayerPreset: (presetId: string) => void;
};

//プリセット適用で保留中の辞書語彙と同梱データ。値設定やスタイルの画面へ移るとLayerEditはアンマウントされ、
//戻ると新しく作られるので、useRefに置くと保存前に失われる。レイヤidをキーにモジュールに置き、保存したら消す
type PendingPreset = { dictionaries: PresetDictionary[]; geojson: FeatureCollection | undefined };
const pendingPresets = new Map<string, PendingPreset>();

/** 保存せずにレイヤ設定を離れたとき、保留中のプリセットの辞書・データを捨てる */
export const discardPendingLayerPreset = (layerId: string) => {
  pendingPresets.delete(layerId);
};

export const useLayerEdit = (
  layer: LayerType,
  isStyleEdited: boolean,
  fieldIndex: number | undefined,
  itemValues: { value: string; isOther: boolean; customFieldValue: string }[] | undefined,
  colorStyle: ColorStyle | undefined,
  useLastValue: boolean | undefined,
  codeFieldId: string | undefined
): UseLayerEditReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const isSettingProject = useSelector((state: RootState) => state.settings.isSettingProject, shallowEqual);
  const layers = useSelector((state: RootState) => state.layers, shallowEqual);
  const user = useSelector((state: RootState) => state.user, shallowEqual);
  const dataSet = useSelector((state: RootState) => selectDataSet(state, layer.id), shallowEqual);
  const isNewLayer = useSelector((state: RootState) => selectIsNewLayer(state, layer.id));

  const [targetLayer, setTargetLayer] = useState<LayerType>(layer);
  const [isEdited, setIsEdited] = useState(isStyleEdited);
  const dataFilter = useSelector((state: RootState) => state.settings.dataFilterPerLayer?.[layer.id], shallowEqual);

  //一覧から開き直した（未編集の）ときは、前回保存せずに離れたプリセットの保留分を捨てる。
  //値設定・スタイルの画面から戻ったときは編集中なので残す
  useEffect(() => {
    if (!isStyleEdited) pendingPresets.delete(layer.id);
    //マウント時の1回だけ。編集の途中で消すとプリセットの辞書が登録されなくなる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const hasAnyRecord = useMemo(
    () =>
      dataSet.some((d) => {
        const records = d.data ?? [];
        return records.length > 0;
      }),
    [dataSet]
  );

  const canChangePermission = useMemo(
    () => isNewLayer || !hasAnyRecord || isSettingProject,
    [hasAnyRecord, isNewLayer, isSettingProject]
  );

  //クラウドのプロジェクトを開いているときだけ。個人（ローカル）では手元のデータが移行されるので対象外
  const unmigratedCloudFieldNames = useMemo(() => {
    if (projectId === undefined || isNewLayer) return [];
    const oldLayer = layers.find((l) => l.id === targetLayer.id);
    if (oldLayer === undefined) return [];
    return getRenamedOrRetypedFieldNames(oldLayer.field, targetLayer.field);
  }, [isNewLayer, layers, projectId, targetLayer.field, targetLayer.id]);

  const lostFieldValueCount = useMemo(() => {
    if (isNewLayer) return 0;
    const oldLayer = layers.find((l) => l.id === targetLayer.id);
    if (oldLayer === undefined) return 0;
    const records = dataSet.flatMap((d) => d.data ?? []);
    return countFieldValuesLostOnFormatChange(records, oldLayer.field, targetLayer.field);
  }, [dataSet, isNewLayer, layers, targetLayer.field, targetLayer.id]);

  useEffect(() => {
    setTargetLayer(layer);
    setIsEdited(isStyleEdited);
  }, [isStyleEdited, layer]);

  // isEditedの変更をReduxに同期
  useEffect(() => {
    dispatch(editSettingsAction({ isEditingLayer: isEdited }));
  }, [dispatch, isEdited]);

  // コンポーネントがアンマウントされるときにisEditingLayerをリセット
  useEffect(() => {
    return () => {
      dispatch(editSettingsAction({ isEditingLayer: false }));
    };
  }, [dispatch]);

  useEffect(() => {
    if (isStyleEdited && colorStyle !== undefined) {
      setIsEdited(true);
      setTargetLayer(applyColorStyle(targetLayer, colorStyle));
    }
    //targetLayerはループするので入れてはいけない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStyleEdited, colorStyle]);

  useEffect(() => {
    if (isStyleEdited && itemValues !== undefined && fieldIndex !== undefined) {
      const newTargetLayer = cloneDeep(targetLayer);
      const targetFormat = newTargetLayer.field[fieldIndex].format;
      if (
        targetFormat === 'STRING' ||
        targetFormat === 'STRING_MULTI' ||
        targetFormat === 'TIMERANGE' ||
        targetFormat === 'DATESTRING'
      ) {
        newTargetLayer.field[fieldIndex].defaultValue = itemValues[0] ? itemValues[0].value : undefined;
      } else if (targetFormat === 'INTEGER' || targetFormat === 'DECIMAL') {
        newTargetLayer.field[fieldIndex].defaultValue = itemValues[0]
          ? parseNumberDefaultValue(itemValues[0].value, targetFormat)
          : undefined;
      } else {
        newTargetLayer.field[fieldIndex].list = itemValues;
      }
      newTargetLayer.field[fieldIndex].useLastValue = useLastValue;
      //コードの入れ先。LIST/RADIO以外では持たない
      newTargetLayer.field[fieldIndex].codeFieldId =
        hasCodeLink(targetFormat) && codeFieldId !== undefined && codeFieldId !== '' ? codeFieldId : undefined;
      setIsEdited(true);
      setTargetLayer(newTargetLayer);
    }
    //targetLayerはループするので入れてはいけない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStyleEdited, itemValues, fieldIndex, codeFieldId]);

  const updateDataOfTheLayer = useCallback(
    (
      initialFields: FieldType[],
      addedFields: FieldType[],
      changeFields: FieldType[],
      deletedFields: FieldType[],
      renames: Map<string, string>
    ) => {
      const updateDataSet = cloneDeep(dataSet);
      updateDataSet.forEach((userData) => {
        //データのフィールドを削除。削除した名前を別のフィールドへ付け直すこともあるので付け替えより先に行う
        userData.data.forEach((d) => {
          deletedFields.forEach(({ name }) => delete d.field[name]);
        });
        //値は属性名をキーに持つため、名前を変えたフィールドは値を新しい名前へ移す
        userData.data.forEach((d) => (d.field = renameRecordFields(d.field, renames)));
        //既存のデータに追加フィールドの値を初期化。既定値を入れると入力済みに見えるため空にする
        userData.data.forEach((d) =>
          addedFields.forEach(({ name, format }) => (d.field[name] = getBlankFieldValue(format)))
        );
        //更新されたフィールドの値を初期化
        userData.data.forEach((d) =>
          changeFields.forEach(({ id, name, format: changedFormat, list }) => {
            const originalFormat = initialFields.find((f) => f.id === id)!.format;
            const originalData = d.field[name];
            d.field[name] = changeFieldValue(originalData, originalFormat, changedFormat, list);
          })
        );
      });
      dispatch(updateDataAction(updateDataSet));
    },
    [dataSet, dispatch]
  );

  const saveLayer = useCallback(() => {
    const oldLayer = layers.find((l) => l.id === targetLayer.id);
    const initialFields = oldLayer !== undefined ? oldLayer.field : [];
    const updateFields = targetLayer.field;
    const deletedFields = initialFields.filter((n) => !updateFields.find((p) => p.id === n.id));
    const addedFields = updateFields.filter((n) => !initialFields.find((p) => p.id === n.id));
    const changedFields = updateFields.filter((n) =>
      initialFields.find(
        (p) => p.id === n.id && (p.format !== n.format || JSON.stringify(p.list) !== JSON.stringify(n.list))
      )
    );
    const renames = new Map<string, string>();
    updateFields.forEach(({ id, name }) => {
      const initialName = initialFields.find((p) => p.id === id)?.name;
      if (initialName !== undefined && initialName !== name) renames.set(initialName, name);
    });
    //削除した属性を指すラベル・色分けは解除し、名前を変えた属性への参照は付け替える
    const deletedNames = new Set(deletedFields.map(({ name }) => name));
    const savedLayer = updateFieldReferences(targetLayer, oldLayer, deletedNames, renames);

    //追加されたフィールドのデータを初期化し、削除されたフィールドをデータからも削除
    updateDataOfTheLayer(initialFields, addedFields, changedFields, deletedFields, renames);

    //データ一覧の絞り込みは列名で持つので、改名に追従させる。消した列の絞り込みは解除する
    //（解除しないと、同じ名前を別の列に付けたときにその列で絞り込まれてしまう）
    if (dataFilter !== undefined && dataFilter.fieldName !== '' && dataFilter.fieldName !== '_user_') {
      const renamedTo = renames.get(dataFilter.fieldName);
      if (renamedTo !== undefined) {
        dispatch(setDataFilterForLayerAction({ layerId: savedLayer.id, text: dataFilter.text, fieldName: renamedTo }));
      } else if (deletedNames.has(dataFilter.fieldName)) {
        dispatch(setDataFilterForLayerAction({ layerId: savedLayer.id, text: '', fieldName: '' }));
      }
    }

    const pendingPreset = pendingPresets.get(savedLayer.id);
    pendingPresets.delete(savedLayer.id);

    if (isNewLayer) {
      dispatch(addLayerAction(savedLayer));
      // プリセット同梱データがあれば投入する。フィールド名で対応付けるので、
      // ユーザーが保存前にフィールドを消していてもその項目が空になるだけで壊れない
      const presetGeojson = pendingPreset?.geojson;
      const presetData =
        presetGeojson !== undefined && savedLayer.type === 'POINT'
          ? geoJson2Data(presetGeojson, savedLayer, 'POINT', dataUser.uid, dataUser.displayName)
          : undefined;
      dispatch(addDataAction([{ layerId: savedLayer.id, userId: dataUser.uid, data: presetData ?? [] }]));
    } else {
      dispatch(updateLayerAction(savedLayer));
    }

    // プリセット適用時の辞書語彙を登録（フィールドが削除されていたら除外）
    const dictionaries = (pendingPreset?.dictionaries ?? []).filter((d) =>
      savedLayer.field.some((f) => f.id === d.fieldId)
    );
    if (dictionaries.length > 0) {
      importPresetDictionaries(savedLayer.id, dictionaries).catch((e) => console.log(e));
    }

    setIsEdited(false);
  }, [dataFilter, dataUser.uid, dataUser.displayName, dispatch, isNewLayer, layers, targetLayer, updateDataOfTheLayer]);

  const deleteLayerPhotos = useCallback(async () => {
    if (Platform.OS === 'web') return;
    if (projectId === undefined) return;
    // IDはクラウド設定由来。`..`等が入っているとフォルダの外を再帰削除してしまう
    if (!isSafePathSegment(projectId) || !isSafePathSegment(targetLayer.id)) return;
    const folder = `${PHOTO_FOLDER}/${projectId}/${targetLayer.id}`;
    await FileSystem.deleteAsync(folder, { idempotent: true });
  }, [projectId, targetLayer.id]);

  const deleteLayer = useCallback(async () => {
    if (targetLayer.type === 'LAYERGROUP') {
      const childLayers = layers
        .map((l) => {
          if (l.groupId === targetLayer.id) {
            return { ...l, groupId: undefined };
          }
          return l;
        })
        .filter((l) => l.id !== targetLayer.id);
      dispatch(setLayersAction(childLayers));
    } else {
      dispatch(deleteDataAction(dataSet));
      dispatch(deleteLayerAction(targetLayer));
    }
  }, [dataSet, dispatch, layers, targetLayer]);

  const changeLayerName = useCallback(
    (val: string) => {
      const m = cloneDeep(targetLayer);
      m.name = val;
      setTargetLayer(m);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const submitLayerName = useCallback(() => {
    const m = cloneDeep(targetLayer);
    m.name = sanitize(targetLayer.name);
    setTargetLayer(m);
  }, [targetLayer]);

  const changeFeatureType = useCallback(
    (itemValue: FeatureType) => {
      const m = cloneDeep(targetLayer);
      if (m.type !== itemValue) {
        m.type = itemValue;
        if (itemValue === 'LAYERGROUP') {
          m.permission = 'COMMON';
        }
        setTargetLayer(m);
        setIsEdited(true);
      }
    },
    [targetLayer]
  );

  //レイヤの用途（飛翔図・植生図）。ツールパレットと色分けをこれで決める。
  //飛翔図・植生図はストロークごと（＝1本ごと・1面ごと）に色を変えるので色分けは「個別」が前提。
  //用途に合わせて自動で切り替え、用途を外したら元の色分けへ戻す
  const changeToolPalette = useCallback(
    (value: ToolPaletteType | undefined) => {
      if (targetLayer.toolPalette === value) return;
      const m = cloneDeep(targetLayer);
      m.toolPalette = value;
      if (value === 'HISYOU') {
        //飛翔図は1本＝1個体の連続追跡。種名・性別・齢を描く前に選ぶので、無ければ作る。
        //色は種名で決める（個体ごとではなく種ごとに見分ける）
        HISYOU_FIELDS.forEach((item) => {
          const { name, values } = item;
          //旧名（雌雄・成幼）のフィールドがあればそれを使う。二重に作らない
          if (findHisyouField(m.field, item) !== undefined) return;
          m.field.push({
            id: ulid(),
            name,
            format: 'LIST',
            //描く前に選ぶ運用なので、既定は未選択にする（勝手に先頭の値が入らないように）
            defaultValue: '',
            list: values.map((value) => ({ value, isOther: false, customFieldValue: '' })),
          });
        });
        m.colorStyle = {
          ...m.colorStyle,
          colorType: 'CATEGORIZED',
          fieldName: findHisyouField(m.field, HISYOU_FIELDS[0])?.name ?? HISYOU_FIELDS[0].name,
          customFieldValue: '',
        };
        setTargetLayer(m);
      } else if (value === 'VEGETATION') {
        //植生図は区分（属性）で色を決める。区分のフィールドが無ければ選択肢つきで作り、
        //色分けをその区分のカテゴリ分けにする。面は塗って見るので枠線のみ表示も外す
        const categoryName = t('common.category');
        let categoryField = m.field.find((f) => f.name === categoryName);
        if (categoryField === undefined) {
          categoryField = { id: ulid(), name: categoryName, format: 'LIST', list: [] };
          m.field.push(categoryField);
        }
        //区分コードは図面の表記に使うので、区分を選ぶだけで入るようコードの入れ先として結ぶ
        const codeName = `${categoryName}${t('common.code')}`;
        let codeField = m.field.find((f) => f.name === codeName);
        if (codeField === undefined) {
          codeField = { id: ulid(), name: codeName, format: 'STRING' };
          m.field.push(codeField);
        }
        //区分が選択肢の形式でないとコードの入れ先は不正な設定になり、値設定の画面にも選び直す欄が無いので結ばない
        if (
          categoryField.codeFieldId === undefined &&
          hasCodeLink(categoryField.format) &&
          isCodeTargetFormat(codeField.format)
        ) {
          categoryField.codeFieldId = codeField.id;
        }
        m.colorStyle = {
          ...m.colorStyle,
          colorType: 'CATEGORIZED',
          fieldName: categoryName,
          customFieldValue: '',
          transparency: false,
        };
        setTargetLayer(m);
      } else {
        setTargetLayer(m.colorStyle.colorType === 'INDIVIDUAL' ? restoreColorStyleFromIndividual(m) : m);
      }
      setIsEdited(true);
    },
    [targetLayer]
  );

  const changePermission = useCallback(
    (val: PermissionType) => {
      if (!canChangePermission) return;
      const m = cloneDeep(targetLayer);
      m.permission = val;
      // 軌跡共有の色分け自動化: 共有ONで初期の単色のままならユーザー別色分けに切替え、
      // 共有OFFで（自動切替した）ユーザー別色分けなら既定の単色に戻す。
      // 管理者がスタイルをカスタム済みの場合（SINGLE/USER以外や色変更後のUSER）は触らない。
      if (m.id === 'track') {
        if (val === 'PUBLIC' && m.colorStyle.colorType === 'SINGLE') {
          const displayNames = Array.from(
            new Set(
              dataSet
                .flatMap((d) => (d.data.length > 0 ? [d.data[0].displayName] : []))
                .filter((v): v is string => typeof v === 'string' && v !== '')
            )
          );
          m.colorStyle.colorType = 'USER';
          // 色はdisplayNameから決定的に生成（未登録ユーザーも描画時に同じ規則でフォールバックされる）
          m.colorStyle.colorList = displayNames.map((name) => ({ value: name, color: getUserColor(name) }));
        } else if (val === 'PRIVATE' && m.colorStyle.colorType === 'USER') {
          m.colorStyle.colorType = 'SINGLE';
          m.colorStyle.color = COLOR.TRACK;
          m.colorStyle.colorList = [];
        }
      }
      setTargetLayer(m);
      setIsEdited(true);
    },
    [canChangePermission, dataSet, targetLayer]
  );

  const changeFieldOrder = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex > targetLayer.field.length - 1) return;
      const newTargetLayer = cloneDeep(targetLayer);
      [newTargetLayer.field[index], newTargetLayer.field[swapIndex]] = [
        newTargetLayer.field[swapIndex],
        newTargetLayer.field[index],
      ];
      setTargetLayer(newTargetLayer);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const changeFieldName = useCallback(
    (index: number, val: string) => {
      const m = cloneDeep(targetLayer);
      m.field[index].name = val;
      setTargetLayer(m);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const submitFieldName = useCallback(
    (index: number) => {
      const { result } = formattedInputs(targetLayer.field[index].name, 'STRING');
      const m = cloneDeep(targetLayer);
      m.field[index].name = result.toString();
      setTargetLayer(m);
    },
    [targetLayer]
  );

  const changeFieldFormat = useCallback(
    (index: number, itemValue: FormatType) => {
      const m = cloneDeep(targetLayer);
      if (m.field[index].format !== itemValue) {
        //辞書型・動的辞書型から対応外の形式に変更した場合は「データ追加に使用」の設定を解除する
        const supportsDictionaryAdd = (format: FormatType) =>
          format === 'STRING_DICTIONARY' || format === 'STRING_DYNAMIC';
        if (supportsDictionaryAdd(m.field[index].format) && !supportsDictionaryAdd(itemValue)) {
          m.field[index].useDictionaryAdd = false;
          if (m.dictionaryFieldId === m.field[index].id) {
            m.dictionaryFieldId = undefined;
          }
        }
        //選択肢から選ぶ形式でなくなったら、コードの入れ先の設定は無効
        if (!hasCodeLink(itemValue)) {
          m.field[index].codeFieldId = undefined;
        }
        //コードの入れ先にできない形式になったら、指している側の設定を解除する
        if (!isCodeTargetFormat(itemValue)) {
          m.field.forEach((f) => {
            if (f.codeFieldId === m.field[index].id) f.codeFieldId = undefined;
          });
        }
        //形式に合わない既定値（STRINGの「未確認」をINTEGERへ、など）は外す
        //形式を行き来して保存済みの形式へ戻したときは、途中で外れた既定値（区分パレットの既定の区分など）を戻す
        const savedField = layers
          .find((l) => l.id === m.id)
          ?.field.find((f) => f.id === m.field[index].id);
        const adaptedDefault = adaptDefaultValueToFormat(m.field[index].defaultValue, m.field[index].format, itemValue, {
          list: m.field[index].list,
          saved: savedField,
        });
        if (adaptedDefault === undefined) delete m.field[index].defaultValue;
        else m.field[index].defaultValue = adaptedDefault;
        m.field[index].format = itemValue;
        setTargetLayer(m);
        setIsEdited(true);
      }
    },
    [layers, targetLayer]
  );

  const changeOption = useCallback(
    (index: number, val: boolean) => {
      //辞書型のフィールドの場合は追加ボタンの表示を切り替える
      //trueにする場合は、他のフィールドの辞書型をfalseにする
      //trueにする場合は、layer.dictionaryFieldIdを設定する
      //falseにする場合は、layer.dictionaryFieldIdが自分のidの場合はundefinedにする
      const m = cloneDeep(targetLayer);
      if (val) {
        m.dictionaryFieldId = m.field[index].id;
        m.field.forEach((f) => {
          if (f.id !== m.field[index].id) {
            f.useDictionaryAdd = false;
          }
        });
        m.field[index].useDictionaryAdd = true;
      } else {
        m.dictionaryFieldId = m.field[index].id === m.dictionaryFieldId ? undefined : m.dictionaryFieldId;
        m.field[index].useDictionaryAdd = false;
      }
      setTargetLayer(m);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const deleteField = useCallback(
    (id: number) => {
      const m = cloneDeep(targetLayer);
      //辞書追加用のフィールドを削除した場合はdictionaryFieldIdも解除する
      if (m.dictionaryFieldId === m.field[id]?.id) {
        m.dictionaryFieldId = undefined;
      }
      //コードの入れ先として指されていた場合は、指していた側の設定も解除する
      const deletedFieldId = m.field[id]?.id;
      m.field.forEach((f) => {
        if (f.codeFieldId === deletedFieldId) f.codeFieldId = undefined;
      });
      m.field.splice(id, 1);

      setTargetLayer(m);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const addField = useCallback(() => {
    const m = cloneDeep(targetLayer);
    m.field.push({ id: ulid(), name: '', format: 'STRING' });
    setTargetLayer(m);
    setIsEdited(true);
  }, [targetLayer]);

  const applyLayerPreset = useCallback(
    (presetId: string) => {
      const preset = LAYER_PRESETS.find((p) => p.presetId === presetId);
      if (preset === undefined) return;
      const { layer: presetLayer, dictionaries } = createLayerFromPreset(preset, layer.id);
      setTargetLayer(presetLayer);
      pendingPresets.set(layer.id, {
        dictionaries,
        geojson: preset.dataKey !== undefined ? PRESET_LAYER_DATA[preset.dataKey] : undefined,
      });
      setIsEdited(true);
    },
    [layer.id]
  );

  return {
    targetLayer,
    isEdited,
    isNewLayer,
    canChangePermission,
    unmigratedCloudFieldNames,
    lostFieldValueCount,
    saveLayer,
    deleteLayer,
    deleteLayerPhotos,
    changeLayerName,
    submitLayerName,
    changeFeatureType,
    changeToolPalette,
    changePermission,
    changeFieldOrder,
    changeFieldName,
    changeOption,
    submitFieldName,
    changeFieldFormat,
    deleteField,
    addField,
    applyLayerPreset,
  } as const;
};

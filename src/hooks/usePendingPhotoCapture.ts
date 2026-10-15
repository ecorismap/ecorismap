import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useDispatch, useStore } from 'react-redux';
import { ulid } from 'ulid';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { BottomSheetScreenName, BottomSheetScreenParams } from '../contexts/BottomSheetNavigationContext';
import { updateRecordsAction } from '../modules/dataSet';
import { editSettingsAction } from '../modules/settings';
import { AppDispatch, RootState } from '../store';
import { PhotoType, RecordType } from '../types';
import { deleteLocalPhoto, takePendingPhoto } from '../utils/Photo';

//保留結果の問い合わせ回数と間隔（合計で約5秒待つ）
const PENDING_RESULT_ATTEMPTS = 10;
const PENDING_RESULT_INTERVAL_MS = 500;

interface Params {
  navigateToSplit: <T extends BottomSheetScreenName>(screen: T, params?: BottomSheetScreenParams[T]) => void;
  openSheet: (index: number) => void;
}

// Androidでは、写真フィールドのカメラ起動中にシステムがMainActivityを破棄することがある。
// プロセスは生きているのでReduxは残るが、Reactツリーは作り直されるため、
// ボトムシート（データ編集画面）が閉じ、launchCameraAsyncのPromiseも戻ってこない。
// DataEditが撮影前に残したpendingPhotoCaptureを手がかりに、expo-image-pickerが保留している
// 撮影結果を回収して同じレコードの写真フィールドへ保存し、データ編集画面を開き直す。
// Homeの再マウント時に一度だけ動く
export const usePendingPhotoCapture = ({ navigateToSplit, openSheet }: Params) => {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const state = store.getState();
    const pending = state.settings.pendingPhotoCapture;
    if (pending === undefined) return;
    //結果の有無にかかわらず記録は消す（次回起動で二重に回収しない）
    dispatch(editSettingsAction({ pendingPhotoCapture: undefined }));

    const layer = state.layers.find((l) => l.id === pending.layerId);
    if (layer === undefined) return;
    const { projectId } = state.settings;
    const folder =
      projectId !== undefined
        ? `${PHOTO_FOLDER}/${projectId}/${layer.id}/${state.user.uid}`
        : `${PHOTO_FOLDER}/LOCAL/${layer.id}/OWNER`;

    (async () => {
      //撮影結果は、再生成されたActivityが再開してimage-pickerが契約を登録し直すまで
      //expo-modules-coreのレジストリに留まり、getPendingResultAsyncには出てこない。
      //再マウント直後は間に合わないことがあるので、しばらく問い合わせを繰り返す
      let photo: Awaited<ReturnType<typeof takePendingPhoto>>;
      for (let attempt = 0; attempt < PENDING_RESULT_ATTEMPTS; attempt++) {
        photo = await takePendingPhoto(folder);
        if (photo !== undefined) break;
        await new Promise((resolve) => setTimeout(resolve, PENDING_RESULT_INTERVAL_MS));
      }
      //保留結果がない＝Activity破棄は起きていない（通常の流れで処理済み）かキャンセル。何もしない
      if (photo === undefined) return;

      const data = store
        .getState()
        .dataSet.find((d) => d.layerId === layer.id && d.data.some((r) => r.id === pending.recordId));
      const record = data?.data.find((r) => r.id === pending.recordId);
      if (data === undefined || record === undefined) {
        //付け先のレコードが消えていたら保存した写真も残さない
        deleteLocalPhoto(photo.uri);
        return;
      }
      const current = record.field[pending.fieldName];
      const photos = Array.isArray(current) ? (current as PhotoType[]) : [];
      const added: PhotoType = {
        id: ulid(),
        name: photo.name,
        url: null,
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        thumbnail: photo.thumbnail,
        key: null,
      } as PhotoType;
      const updated: RecordType = {
        ...record,
        updatedAt: Date.now(),
        field: { ...record.field, [pending.fieldName]: [...photos, added] },
      };
      //データ編集画面のローカル状態は失われているので、写真はそのままレコードへ保存する
      dispatch(updateRecordsAction({ layerId: layer.id, userId: data.userId, data: [updated] }));
      openSheet(2);
      navigateToSplit('DataEdit', { previous: 'Data', targetData: updated, targetLayer: layer });
    })();
    // 再マウント時に一度だけ実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

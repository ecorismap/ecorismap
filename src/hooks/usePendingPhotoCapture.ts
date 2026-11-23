import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { useDispatch, useStore } from 'react-redux';
import { ulid } from 'ulid';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { BottomSheetScreenName, BottomSheetScreenParams } from '../contexts/BottomSheetNavigationContext';
import { updateRecordsAction } from '../modules/dataSet';
import { editSettingsAction } from '../modules/settings';
import { AppDispatch, RootState } from '../store';
import { PhotoType, RecordType } from '../types';
import { deleteLocalPhoto, takePendingPhoto } from '../utils/Photo';
import { detachCopiedRecordPhotos, DetachedPhotosResult } from '../utils/photoCopy';
import { copiedPhotosMessage } from '../utils/photoCopyMessage';
import * as projectStorage from '../lib/firebase/storage';

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
// 撮影前の編集中の下書き（先に付けた写真・未保存の入力）も残してあるので、それを土台にする。
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
    if (layer === undefined) {
      //レイヤごと消えていたら、編集中に足した写真のファイルは孤児になるので消す
      pending.draft?.temporaryAddedPhotoList.forEach(({ uri }) => deleteLocalPhoto(uri));
      return;
    }
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
      //撮影直前の編集中の下書き。旧版が残した記録や、別の記録のものなら使わない
      const draft = pending.draft?.record.id === pending.recordId ? pending.draft : undefined;
      //保留結果がない＝Activity破棄は起きていない（通常の流れで処理済み）かキャンセル。
      //下書きに未保存の編集がなければ失うものはないので何もしない
      if (photo === undefined && (draft === undefined || !draft.isEditing)) return;

      //付け先の集合。テンプレートの記録を保存すると、テンプレートの集合に同じ id の墓標（deleted）が残り、自分の集合に
      //同じ id の写しが入る。墓標を拾うとテンプレートの写しと取り違え、写しの写真を全部付け替えてしまうので、墓標でない
      //記録を持つ集合から、下書きの名義（なければ自分）の集合を優先して選ぶ
      const current = store.getState();
      const liveBuckets = current.dataSet.filter(
        (d) => d.layerId === layer.id && d.data.some((r) => r.id === pending.recordId && r.deleted !== true)
      );
      const preferredUserId = draft !== undefined ? draft.record.userId : current.user.uid;
      const data = liveBuckets.find((d) => d.userId === preferredUserId) ?? liveBuckets[0];
      const record = data?.data.find((r) => r.id === pending.recordId && r.deleted !== true);
      if (data === undefined || record === undefined) {
        //付け先のレコードが消えていたら、撮った写真も編集中に足した写真も残さない（孤児になるため）
        if (photo !== undefined) deleteLocalPhoto(photo.uri);
        draft?.temporaryAddedPhotoList.forEach(({ uri }) => deleteLocalPhoto(uri));
        return;
      }
      //データ編集画面の状態は失われているので、下書き（なければ保存済みの記録）を土台に写真を足して保存する。
      //下書きには先に付けた写真や未保存の入力が入っている
      const base = draft?.record ?? record;
      const currentPhotos = base.field[pending.fieldName];
      const photos = Array.isArray(currentPhotos) ? (currentPhotos as PhotoType[]) : [];
      const added: PhotoType[] =
        photo === undefined
          ? []
          : [
              {
                id: ulid(),
                name: photo.name,
                url: null,
                uri: photo.uri,
                width: photo.width,
                height: photo.height,
                thumbnail: photo.thumbnail,
                key: null,
              } as PhotoType,
            ];
      const merged: RecordType = {
        ...base,
        updatedAt: Date.now(),
        field: { ...base.field, [pending.fieldName]: [...photos, ...added] },
      };
      //実行中のプロジェクトでテンプレートの記録を保存すると、テンプレートは残したまま自分の写しになる
      //（modules/recordOwnership の copy）。データ編集画面の保存（useDataEdit の saveData）と同じ規則を通す（写真監査 P-M10）
      const latest = store.getState();
      //判定は saveData と同じく土台にした記録の名義だけで行う（集合の名義は見ない）
      const isTemplateCopy =
        latest.settings.projectId !== undefined &&
        !latest.settings.isSettingProject &&
        latest.user.uid !== undefined &&
        base.userId === 'template';
      //編集中に外した写真は、保存したのでファイルも消す。ただしテンプレートの写しでは、外した写真は
      //テンプレートの写真として残るので消さない
      if (!isTemplateCopy) draft?.temporaryDeletePhotoList.forEach(({ uri }) => deleteLocalPhoto(uri));
      //写しの写真はテンプレートと切り離す。編集中に足した写真といま撮った写真は既に自分だけのファイルなので、そのまま残す
      const keepPhotoIds = new Set([
        ...(draft?.temporaryAddedPhotoList.map(({ photoId }) => photoId) ?? []),
        ...added.map(({ id }) => id),
      ]);
      //（await は三項演算子の外に出す。Hermes で三項演算子内のオブジェクトリテラルと await を混ぜると値が壊れる）
      let detached: DetachedPhotosResult = { record: merged, droppedPhotoCount: 0, sharedPhotoCount: 0 };
      if (isTemplateCopy) {
        const projectId_ = latest.settings.projectId;
        detached = await detachCopiedRecordPhotos(layer, merged, folder, keepPhotoIds, {
          source: { userId: base.userId, takenOverFrom: base.takenOverFrom },
          projectId: projectId_,
          uid: latest.user.uid,
          //原画が手元にない写真はクラウドから取得して自分の写真フォルダへ置く（写真監査 P-M10(a)）
          downloadPhoto: async (cloudPhoto, filename) => {
            if (typeof cloudPhoto.url !== 'string' || typeof cloudPhoto.key !== 'string') return undefined;
            const res = await projectStorage.downloadPhoto(cloudPhoto.url, cloudPhoto.key, filename, folder);
            return res.isOK && typeof res.uri === 'string' ? res.uri : undefined;
          },
        });
      }
      const updated = detached.record;
      //写せなかった写真・元の写真を参照したままの写真は、黙っていずに知らせる
      const copyMessage = copiedPhotosMessage(detached);
      if (copyMessage !== '') Alert.alert('', copyMessage);
      dispatch(updateRecordsAction({ layerId: layer.id, userId: data.userId, data: [updated] }));
      openSheet(2);
      navigateToSplit('DataEdit', { previous: 'Data', targetData: updated, targetLayer: layer });
    })();
    // 再マウント時に一度だけ実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

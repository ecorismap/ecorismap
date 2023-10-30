import { useCallback, useEffect, useRef } from 'react';
import { toDate, uploadCurrentPosition } from '../lib/firebase/firestore';
import { LocationType, MemberLocationType, PositionFS } from '../types';
import { editSettingsAction } from '../modules/settings';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import dayjs from '../i18n/dayjs';
import { decryptEThree as dec } from '../lib/virgilsecurity/e3kit';
import { isLoggedIn } from '../utils/Account';
import { hasOpened } from '../utils/Project';
import { firestore } from '../lib/firebase/firebase';

export type UseSyncLocationReturnType = { uploadLocation: (currentLocation: LocationType | null) => void };

export const useSyncLocation = (projectId: string | undefined): UseSyncLocationReturnType => {
  const dispatch = useDispatch();
  const isSynced = useSelector((state: AppState) => state.settings.isSynced, shallowEqual);
  const user = useSelector((state: AppState) => state.user);
  const syncSubscriber = useRef<any>(undefined);
  const lastUploadTime = useRef<dayjs.Dayjs>(dayjs());

  const syncCurrentPosition = useCallback(
    (userId: string, projectId_: string) => {
      try {
        const syncSubscriber_ = firestore
          .collection(`projects/${projectId_}/position`)
          //データがない場合エラーになるのでだめ
          //.where(firestore.FieldPath.documentId(), '!=', userId)
          //@ts-ignore
          .onSnapshot(async (snapshot) => {
            let positions: MemberLocationType[] = await Promise.all(
              snapshot.docs.map(async (v: any) => {
                const { encdata, encryptedAt } = v.data() as PositionFS;
                const dataString = await dec(toDate(encryptedAt), encdata, v.id, projectId_);
                return {
                  uid: v.id,
                  icon: dataString.icon,
                  coords: dataString.coords,
                };
              })
            );
            positions = positions.filter((d: MemberLocationType) => d.uid !== userId);
            dispatch(editSettingsAction({ memberLocation: positions }));
          });
        return syncSubscriber_;
      } catch (error) {
        console.log(error);
        return undefined;
      }
    },
    [dispatch]
  );

  const uploadLocation = useCallback(
    async (currentLocation: LocationType | null) => {
      //ログインしてて、プロジェクトに参加していて、シンクで、60秒経ってたら

      if (currentLocation === null) return;
      if (isLoggedIn(user) && hasOpened(projectId)) {
        if (isSynced && dayjs().diff(lastUploadTime.current) / (60 * 1000) > 0) {
          //console.log('$$$ upload pos $$$', coords);
          const { isOK, message } = await uploadCurrentPosition(user.uid, projectId!, {
            icon: { photoURL: user.photoURL, initial: user.email![0].toUpperCase() },
            coords: currentLocation,
          });
          if (isOK) {
            lastUploadTime.current = dayjs();
          } else {
            throw new Error(message);
          }
        }
      }
    },
    [isSynced, projectId, user]
  );

  useEffect(() => {
    if (isSynced === true && syncSubscriber.current === undefined) {
      if (isLoggedIn(user) && hasOpened(projectId)) {
        //console.log('sync start');
        syncSubscriber.current = syncCurrentPosition(user.uid, projectId!);
      }
    }
    return () => {
      if (syncSubscriber.current !== undefined) {
        syncSubscriber.current();
        syncSubscriber.current = undefined;
        // console.log('!!!!!!!!!!!!!!', 'sync stop2');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSynced, projectId, user.uid]);

  return { uploadLocation } as const;
};

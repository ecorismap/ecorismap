import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { deleteLocalPhoto } from '../utils/Photo';

export interface AcquiredPhoto {
  uri: string;
  thumbnail: string | null;
  width: number | undefined;
  height: number | undefined;
  name: string;
}

/** added=付けた / busy=別の取り込みの実行中 / none=写真なし（キャンセルなど） / stale=付け先が変わったので捨てた */
export type PhotoAcquisitionResult = 'added' | 'busy' | 'none' | 'stale';

interface Params {
  /** 付け先の記録を表す値（レイヤ id と記録 id）。取り込みの間に変わったら写真を付けない */
  recordKey: string;
  addPhoto: (fieldName: string, photo: AcquiredPhoto) => void;
  /** 取り込みの間、画面の操作を止めるか。省略時は Web 以外で止める */
  blockWhileAcquiring?: boolean;
}

// 写真の撮影・選択と保存（コピー・サムネイル・カメラロール保存）には時間がかかる。その間に記録を切り替えたり
// 画面を閉じたりすると、終わった時点の古い addPhoto が別の記録の番号の画面に元の記録＋写真を書き戻したり、
// 閉じた後に編集中の印を立て直したりする（写真監査 P-L3）。関数形の setState にしても、今度は切り替えた先の
// 記録に写真が付く別の取り違えになる。そこで、
// - 実行中は重ねて走らせず、isPhotoProcessing で画面の操作を止める
// - 開始時の付け先とマウント状態を控え、終わったときに違えば作った写真ファイルを消して何もしない
// - 付けるときは最新の addPhoto を使う（実行中に入力した値を古い記録で上書きしない）
// ただし Web では止めない。expo-image-picker の Web 実装はキャンセルを input の 'cancel' イベントでしか返さず、
// それを出さないブラウザ（Safari 16.4 未満など）ではキャンセルしても待ちが終わらない。止めると保存・戻る・
// 記録の切り替えが二度と効かなくなり、未保存の入力を失う。Web でも付け先の照合はするので、取り違えは起きない
//
// 「処理中...」の表示・ボタンの無効化・押されたときの受け付け判定は、同じ isPhotoProcessing から決める（PHOTO-10）。
// 以前は押下の判定だけが即座に切り替わる ref を見ていたため、表示と判定が描画1回分ずれた。
// - 終わり: ref は finally で即 false になるが、表示（state）が消えるのは次の描画。その間「処理中...」が出たまま
//   戻る・記録の切り替えなどの押下が通っていた
// - 写真を付ける addPhoto と、付け先が変わったときのファイル削除（await）が、印を下ろした後に走っていた
// そこで、押下の判定は「描画に反映済みの isPhotoProcessing」または「今まさに始めた取り込み」のどちらかで止め、
// 印は写真を付け終える（または捨て終える）まで下ろさない。これで「処理中...」が消える描画と同時にボタンも押せるようになる
export const usePhotoAcquisition = ({ recordKey, addPhoto, blockWhileAcquiring = Platform.OS !== 'web' }: Params) => {
  const [isPhotoProcessing, setIsPhotoProcessing] = useState(false);
  //取り込みの重複開始を止める錠。setState の描画を待たずに即座に立つ
  const isProcessingRef = useRef(false);
  //画面に反映済みの isPhotoProcessing。描画の確定時（画面に出る前）に合わせる
  const isProcessingShownRef = useRef(false);
  useLayoutEffect(() => {
    isProcessingShownRef.current = isPhotoProcessing;
  }, [isPhotoProcessing]);
  //押下の受け付け判定用。「処理中...」が画面に出ている間、または取り込みを始めた直後（描画前）は true
  const isPhotoProcessingRef = useMemo<{ readonly current: boolean }>(
    () => ({
      get current() {
        return isProcessingRef.current || isProcessingShownRef.current;
      },
    }),
    []
  );
  const isMountedRef = useRef(true);
  const recordKeyRef = useRef(recordKey);
  const addPhotoRef = useRef(addPhoto);
  const blockWhileAcquiringRef = useRef(blockWhileAcquiring);

  useEffect(() => {
    recordKeyRef.current = recordKey;
    addPhotoRef.current = addPhoto;
    blockWhileAcquiringRef.current = blockWhileAcquiring;
  }, [addPhoto, blockWhileAcquiring, recordKey]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const acquirePhoto = useCallback(
    async (fieldName: string, acquire: () => Promise<AcquiredPhoto | undefined>): Promise<PhotoAcquisitionResult> => {
      if (isPhotoProcessingRef.current) return 'busy';
      const blocks = blockWhileAcquiringRef.current;
      if (blocks) {
        isProcessingRef.current = true;
        setIsPhotoProcessing(true);
      }
      const startKey = recordKeyRef.current;
      try {
        const photo = await acquire();
        if (photo === undefined) return 'none';
        if (!isMountedRef.current || recordKeyRef.current !== startKey) {
          //付け先がもうないので、作った写真は孤児になる
          await deleteLocalPhoto(photo.uri).catch(() => undefined);
          return 'stale';
        }
        //印を下ろす前に付ける。写真の表示と「処理中...」の消去が同じ描画になる
        addPhotoRef.current(fieldName, photo);
        return 'added';
      } finally {
        if (blocks) {
          isProcessingRef.current = false;
          if (isMountedRef.current) setIsPhotoProcessing(false);
        }
      }
    },
    [isPhotoProcessingRef]
  );

  return { isPhotoProcessing, isPhotoProcessingRef, acquirePhoto };
};

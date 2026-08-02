import { useEffect, useRef, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { isLoggedIn } from '../utils/Account';
import { getTileSignatures } from '../lib/firebase/firestore';
import { clearTileSignaturesAction, mergeTileSignaturesAction } from '../modules/tileSignatures';
import { collectSignatureTargetUrls, nowSec, resolveTargets } from '../utils/TileSignature';

// 呼び出しに失敗してからこの秒数は再試行しない。
// tileMapsが変わるたびに効果が走るため、恒常的に失敗する状態（App Check不備など）だと
// レイヤ操作のたびに呼び出しが飛んでしまう。それを抑えるための下限間隔。
const FAILURE_COOLDOWN_SEC = 5 * 60;

// 署名付きタイル配信の署名を、tileMapsの状態に追随して取得するフック。
//
// 呼び出し箇所ではなく状態を監視する形にしている。setTileMapsActionは22箇所から
// 呼ばれており（プロジェクトを開く/閉じる、.ecorismapの読み込み、バックアップ復元、
// 地図の追加・編集…）、個別にフックすると必ずどこかで漏れるため。
//
// 未解決のURLが無ければ通信は発生しない。定常状態では週1回程度。
export const useTileSignatures = (): void => {
  const dispatch = useDispatch();
  const tileMaps = useSelector((state: RootState) => state.tileMaps, shallowEqual);
  const signatures = useSelector((state: RootState) => state.tileSignatures);
  const user = useSelector((state: RootState) => state.user);
  const loggedIn = isLoggedIn(user);
  // 同じURL群への多重リクエストを防ぐ
  const resolving = useRef(false);
  const wasLoggedIn = useRef(loggedIn);
  const failedAt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // クールダウン明けに一度だけ効果を再実行させるためのカウンタ
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    // ログアウトしたら署名を破棄する（端末に他人の資格情報を残さない）
    if (wasLoggedIn.current && !loggedIn) {
      dispatch(clearTileSignaturesAction());
    }
    wasLoggedIn.current = loggedIn;
  }, [dispatch, loggedIn]);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  useEffect(() => {
    // 未ログイン（Google個人アカウント含む）はcallableを呼べない。
    // 公開レイヤは従来通り表示され、保護レイヤは表示できないという挙動になる。
    if (!loggedIn || resolving.current) return;
    const now = nowSec();
    if (failedAt.current !== 0 && now - failedAt.current < FAILURE_COOLDOWN_SEC) return;

    const urls = collectSignatureTargetUrls(tileMaps);
    const targets = resolveTargets(urls, signatures, now);
    if (targets.length === 0) return;

    resolving.current = true;
    (async () => {
      try {
        const result = await getTileSignatures(targets);
        dispatch(mergeTileSignaturesAction({ requested: targets, checkedAt: nowSec(), ...result }));
        failedAt.current = 0;
      } catch (e) {
        // 圏外や一時障害。前回のキャッシュを使い続ける。
        // 署名は90日有効なので、取得できない期間があっても実害は小さい。
        failedAt.current = nowSec();
        // 圏外から戻ったときに手動操作を待たずに済むよう、クールダウン明けに一度だけ再開する
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => setRetryTick((n) => n + 1), FAILURE_COOLDOWN_SEC * 1000);
      } finally {
        resolving.current = false;
      }
    })();
  }, [dispatch, loggedIn, signatures, tileMaps, retryTick]);
};

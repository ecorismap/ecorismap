import { useEffect, useRef } from 'react';
import { shallowEqual, useSelector, useStore } from 'react-redux';
import { RootState } from '../../store';
import { clearProjectMarks, getUnsyncedMarks, hasUnsyncedChanges, markProjectOpened } from '../../utils/unsyncedChanges';

/**
 * Web版で、アップロードしていない変更がある間だけタブを閉じる・再読み込みする前に標準の離脱確認を出す。
 * Web版の記録はタブごとの保存で、タブを閉じると消える（仕様）。知らずに閉じて記録を失わないようにする。
 * 表示を持たない常駐コンポーネント。アプリのルート（Provider配下）に1つだけ置く。
 */
export const UnsyncedChangesGuard = (): null => {
  const store = useStore<RootState>();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const previousProjectIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const previous = previousProjectIdRef.current;
    if (previous !== undefined && previous !== projectId) clearProjectMarks(previous);
    previousProjectIdRef.current = projectId;
    if (projectId !== undefined) markProjectOpened(projectId);
  }, [projectId]);

  useEffect(() => {
    //判定は閉じる瞬間の state で行う（dataSet の更新ごとに再描画しないため、購読せず getState で読む）
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      try {
        const state = store.getState();
        const currentProjectId = state.settings.projectId;
        const marks = currentProjectId === undefined ? { layerUploadedAt: {} } : getUnsyncedMarks(currentProjectId);
        if (!hasUnsyncedChanges(state.dataSet ?? [], currentProjectId, state.user.uid, marks)) return;
      } catch {
        //判定できないときは記録を守る側に倒して確認を出す
      }
      event.preventDefault();
      //古いブラウザは returnValue を設定しないと確認を出さない（文言はブラウザ既定のものが出る）
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [store]);

  return null;
};

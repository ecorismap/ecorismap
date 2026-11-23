/**
 * 3Dカメラの現在位置を、3Dの外（toggleTerrain）から同期的に読むための窓口。
 *
 * mapRegionへの同期はHome全体の再レンダリングを避けるため間引いており、
 * 3Dを抜ける瞬間にはまだ古いことがある。2DのMapViewはinitialRegionで開くので、
 * 抜ける時点で最新の位置を渡さないと慣性移動・ズーム前の位置へ戻ってしまう
 */
import { RegionType } from '../../types';

type RegionProvider = () => RegionType | null;

let provider: RegionProvider | null = null;

/** @returns 登録を外す関数（自分が登録したものだけを外す） */
export const setTerrain3DRegionProvider = (next: RegionProvider): (() => void) => {
  provider = next;
  return () => {
    if (provider === next) provider = null;
  };
};

/** 3D表示中ならカメラの現在位置。3Dが無ければnull */
export const getTerrain3DRegion = (): RegionType | null => (provider === null ? null : provider());

/**
 * ジェスチャ中のmapRegion同期を指を離すまで持ち越す。
 *
 * mapRegionへのdispatchはHome全体を再レンダリングし、走っているジェスチャを止める。
 * 慣性停止や間引き明けの後追い同期は次のジェスチャ中に来ることがあるので、
 * 操作中は捨てずに保留し、全ての指が離れたときに1回だけ同期する
 */
export const createInteractionSyncGate = () => {
  let pending = false;
  return {
    /** 今は同期しないならtrue（保留に積む）。指を離した時点の同期（force）は通す */
    shouldDefer(force: boolean, interacting: boolean): boolean {
      if (force || !interacting) return false;
      pending = true;
      return true;
    },
    /** 同期できたら保留を消す（指を離した時点の同期で用が済む） */
    markSynced(): void {
      pending = false;
    },
    /** 保留を積む（後追いタイマーを操作開始で取り消したとき） */
    markPending(): void {
      pending = true;
    },
    /** 操作が全て終わったときに呼ぶ。保留があればtrueを返して消す */
    takePending(interacting: boolean): boolean {
      if (interacting || !pending) return false;
      pending = false;
      return true;
    },
  };
};

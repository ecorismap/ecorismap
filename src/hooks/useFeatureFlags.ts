import { useSelector } from 'react-redux';
import { RootState } from '../store';

export type UseFeatureFlagsReturnType = {
  hisyouTool: boolean;
  mapPresets: boolean;
  layerPresets: boolean;
};

/**
 * 機能フラグ。組織アカウント（Firebaseログイン）限定機能の有効判定を集約する。
 * サインアップはサーバー側でドメイン制限されているため、ログイン済み＝組織メンバーとして扱う。
 * ログイン状態はredux-persistで保持されるので、一度ログインすればオフラインでも有効。
 *
 * 地図プリセットは全ユーザーに開放済み（2026-08。プリセットは全て出典表記済みの公開可能データ）。
 * 飛翔図は猛禽類調査の作法そのもの（旋回・旋上・誇示…）で、使えるのは実質プロの調査者なので
 * 組織アカウント限定に戻した（2026-09）。植生図は汎用のカテゴリ色分けなので全ユーザーに開放。
 * 開放・限定の切り替えはこのフック1箇所で対応できる。
 */
export const useFeatureFlags = (): UseFeatureFlagsReturnType => {
  const uid = useSelector((state: RootState) => state.user.uid);
  const isOrgMember = uid !== undefined;
  return { hisyouTool: isOrgMember, mapPresets: true, layerPresets: isOrgMember } as const;
};

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
 * 限定に戻す場合はこのフック1箇所の変更で対応できる。
 */
export const useFeatureFlags = (): UseFeatureFlagsReturnType => {
  const uid = useSelector((state: RootState) => state.user.uid);
  const isOrgMember = uid !== undefined;
  return { hisyouTool: isOrgMember, mapPresets: true, layerPresets: isOrgMember } as const;
};

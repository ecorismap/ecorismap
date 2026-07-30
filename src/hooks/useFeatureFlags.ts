import { useSelector } from 'react-redux';
import { RootState } from '../store';

export type UseFeatureFlagsReturnType = {
  hisyouTool: boolean;
  mapLayerPresets: boolean;
};

/**
 * 組織アカウント（Firebaseログイン）限定機能の有効判定。
 * サインアップはサーバー側でドメイン制限されているため、ログイン済み＝組織メンバーとして扱う。
 * ログイン状態はredux-persistで保持されるので、一度ログインすればオフラインでも有効。
 */
export const useFeatureFlags = (): UseFeatureFlagsReturnType => {
  const uid = useSelector((state: RootState) => state.user.uid);
  const isOrgMember = uid !== undefined;
  return { hisyouTool: isOrgMember, mapLayerPresets: isOrgMember } as const;
};

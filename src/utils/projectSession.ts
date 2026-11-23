import { SettingsType } from '../types';

type ProjectSessionSettings = Pick<SettingsType, 'projectId' | 'projectSessionUid'>;

/**
 * 開いているプロジェクトの状態がどのアカウントのものか。キーの無い旧データ（この版より前に開いたプロジェクト）は、
 * いま Redux にいるユーザーのものとみなす（セッション切れや取りやめられないログアウトでも Redux の user は
 * 前の人のまま残るか、ログアウト直前に記録されるため）
 */
export const resolveProjectSessionUid = (
  settings: ProjectSessionSettings,
  currentUserUid: string | undefined
): string | undefined => {
  if (settings.projectId === undefined) return undefined;
  return settings.projectSessionUid ?? currentUserUid;
};

/**
 * ログインしようとしているアカウントが、開いたままのプロジェクトの持ち主と違うか（A-M1）。
 * 違うなら前の人の権限表示・位置共有・未送信データを引き継がないよう、閉じてからログインさせる。
 * 持ち主が分からないとき（未ログインで開いたままの旧データなど）は今の挙動を保つ
 */
export const isOtherUsersProjectOpen = (
  settings: ProjectSessionSettings,
  currentUserUid: string | undefined,
  loginUid: string
): boolean => {
  const owner = resolveProjectSessionUid(settings, currentUserUid);
  return owner !== undefined && owner !== loginUid;
};

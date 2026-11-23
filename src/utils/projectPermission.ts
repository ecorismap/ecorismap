import { ProjectType } from '../types';

/**
 * プロジェクトを削除できるのはオーナーだけ（firestore.rules の project doc の delete がオーナー限定）。
 * Storage の Rules は管理者にも projects/{id} 配下の一覧と削除を許している（クラウドデータ管理・PDF/STYLE の掃除のため）ので、
 * オーナーでない管理者が削除を進めると Storage だけが全部消え、project doc とデータが残ってしまう。Storage に触れる前に止める
 */
export const canDeleteProject = (project: Pick<ProjectType, 'ownerUid'>, uid: string | undefined): boolean =>
  !!uid && project.ownerUid === uid;

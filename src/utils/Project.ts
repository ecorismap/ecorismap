import { ProjectType } from '../types';
import { formattedInputs } from './Format';

export const hasOpened = (projectId: string | undefined): projectId is string => {
  return projectId !== undefined;
};

/**
 * メンバーのメールの比較・保存用の形。Firebase Auth の照会は大文字小文字を区別しないので、
 * そろえずに比べると同じ人が別の行として2つ登録できてしまう（A-L15）
 */
export const normalizeMemberEmail = (email: string) => email.trim().toLowerCase();

export const checkDuplicateMember = (project: ProjectType, idx: number) => {
  const email = normalizeMemberEmail(project.members[idx].email);
  const duplicatedEmail = project.members.filter((v) => normalizeMemberEmail(v.email) === email);
  if (duplicatedEmail.length > 1) {
    return false;
  }
  return true;
};

export const checkEmails = (project: ProjectType) => {
  const emails = project.members.map((member) => member.email);
  const hasInvalidEmail = emails.some((email) => {
    const emailCheck = formattedInputs(email, 'email');
    return !emailCheck.isOK;
  });
  if (hasInvalidEmail) {
    return { isOK: false, emails };
  } else {
    return { isOK: true, emails };
  }
};

/**
 * 新規プロジェクトの保存で使う id を決める。一度保存を試みた id は使い回さない。
 * 失敗の後始末で projects/{id} を消すと Functions の連鎖削除（onDocumentDeleted）が遅れて走るため、
 * 同じ id で作り直すと、作り直したプロジェクトまで後から消されてしまう
 */
export const pickNewProjectIdForSave = (id: string, attemptedIds: Set<string>, generateId: () => string): string => {
  let nextId = id;
  while (attemptedIds.has(nextId)) nextId = generateId();
  attemptedIds.add(nextId);
  return nextId;
};

/** uid が解決済みの行のうち、同じ uid が2行以上あるか。行ごとに役割が違うと、外したはずの管理者権限が残る */
export const hasDuplicateMemberUid = (project: ProjectType) => {
  const uids = project.members.map((m) => m.uid).filter((uid): uid is string => !!uid);
  return new Set(uids).size !== uids.length;
};

import { ProjectType } from '../types';
import { formattedInputs } from './Format';

export const hasOpened = (projectId: string | undefined): projectId is string => {
  return projectId !== undefined;
};

export const checkDuplicateMember = (project: ProjectType, idx: number) => {
  const email = project.members[idx].email;
  const duplicatedEmail = project.members.filter((v) => v.email === email);
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

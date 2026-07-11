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

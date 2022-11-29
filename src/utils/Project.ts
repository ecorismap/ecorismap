import { FUNC_CHECK_LICENSE } from '../constants/AppConstants';
import { t } from '../i18n/config';
import { License, ProjectType } from '../types';
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

export const validateProjectLicense = (customerLicense: License | undefined, ownerProjectsCount: number) => {
  if (!FUNC_CHECK_LICENSE) return { isOK: true, message: '' };
  if (customerLicense === 'Free' && ownerProjectsCount >= 1) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateProjectFree'),
    };
  } else if (customerLicense === 'Basic' && ownerProjectsCount >= 5) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateProjectBasic'),
    };
  } else if (customerLicense === 'Pro' && ownerProjectsCount >= 10) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateProjectPro'),
    };
  } else if (customerLicense === 'BusinessA' && ownerProjectsCount >= 10) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateProjectBusinessA'),
    };
  } else if (customerLicense === 'BusinessB' && ownerProjectsCount >= 5) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateBusinessB'),
    };
  } else if (customerLicense === undefined) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateUndefined'),
    };
  }
  return { isOK: true, message: '' };
};

export const validateMemberLicense = (projectLicense: License, memberCount: number) => {
  if (!FUNC_CHECK_LICENSE) return { isOK: true, message: '' };
  if (projectLicense === 'Free' && memberCount >= 3) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateMemberFree'),
    };
  } else if (projectLicense === 'Basic' && memberCount >= 5) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateMemberBasic'),
    };
  } else if (projectLicense === 'Pro' && memberCount >= 10) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateMemberPro'),
    };
  } else if (projectLicense === 'BusinessA' && memberCount >= 20) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateMemberBusinessA'),
    };
  } else if (projectLicense === 'BusinessB' && memberCount >= 40) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateMemberBusinessB'),
    };
  } else if (projectLicense === 'Unkown') {
    return {
      isOK: false,
      message: t('utils.Project.message.validateUndefined'),
    };
  }
  return { isOK: true, message: '' };
};

export const validateStorageLicense = (projectLicense: License, storageCount: number) => {
  if (!FUNC_CHECK_LICENSE) return { isOK: true, message: '' };
  if (projectLicense === 'Free' && storageCount >= 0.1) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateStorageFree'),
    };
  } else if (projectLicense === 'Basic' && storageCount >= 1) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateStorageBasic'),
    };
  } else if (projectLicense === 'Pro' && storageCount >= 5) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateStoragePro'),
    };
  } else if (projectLicense === 'BusinessA' && storageCount >= 10) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateStorageBusinessA'),
    };
  } else if (projectLicense === 'BusinessB' && storageCount >= 20) {
    return {
      isOK: false,
      message: t('utils.Project.message.validateStorageBusinessB'),
    };
  } else if (projectLicense === 'Unkown') {
    return {
      isOK: false,
      message: t('utils.Project.message.validateUndefined'),
    };
  }
  return { isOK: true, message: '' };
};

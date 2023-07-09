import { cloneDeep } from 'lodash';
import { useCallback } from 'react';
import { t } from '../i18n/config';
import { addGroupMembers, createGroup, deleteGroup, deleteGroupMembers, loadGroup } from '../lib/virgilsecurity/e3kit';
import { ProjectType, VerifiedType } from '../types';

export type UseE3kitGroupReturnType = {
  loadE3kitGroup: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  createE3kitGroup: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
    project: ProjectType;
  }>;
  updateE3kitGroupMembers: (
    originalProject: ProjectType,
    updateProject: ProjectType
  ) => Promise<{
    isOK: boolean;
    message: string;
    project: ProjectType;
  }>;
  deleteE3kitGroupMembers: (
    projectId: string,
    ownerUid: string,
    uid: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  deleteE3kitGroup: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useE3kitGroup = (): UseE3kitGroupReturnType => {
  const loadE3kitGroup = async (project: ProjectType) => {
    const { isOK } = await loadGroup(project.id, project.ownerUid);
    if (!isOK) {
      return { isOK: false, message: t('hooks.message.failLoadE3kitGroup') };
    }
    return { isOK: true, message: '' };
  };

  const createE3kitGroup = useCallback(async (project: ProjectType) => {
    const addedMembers = project.members.map((d) => d.verified === 'HOLD' && d.uid).filter((v): v is string => !!v);
    const result = await createGroup(project.id, addedMembers);
    if (!result.isOK) {
      return { isOK: false, message: t('hooks.message.failCreateE3kitGroup'), project };
    }
    const members = cloneDeep(project.members);
    const updatedMembers = members.map((d) => {
      if (d.verified === 'HOLD') {
        return { ...d, verified: 'OK' as VerifiedType };
      } else {
        return d;
      }
    });

    return { isOK: true, message: '', project: { ...project, members: updatedMembers } };
  }, []);

  const deleteE3kitGroup = useCallback(async (project: ProjectType) => {
    const participants = project.membersUid.filter((v) => v !== project.ownerUid);
    if (participants.length > 0) {
      const { isOK } = await deleteGroupMembers(project.id, project.ownerUid, participants);
      if (!isOK) {
        return { isOK: false, message: t('hooks.message.failDeleteE3kitGroup') };
      }
    }
    const { isOK } = await deleteGroup(project.id);
    if (!isOK) {
      return { isOK: false, message: t('hooks.message.failDeleteGroup') };
    }
    return { isOK: true, message: '' };
  }, []);

  const deleteE3kitGroupMembers = useCallback(async (projectId: string, ownerUid: string, uid: string) => {
    //まだグループに入っていないかもしれないが、ローテーションしたユーザーのために一旦削除処理する。エラーは無視。
    //グループに入っているかどうか確認できれば良いが、その方法はない？

    const { isOK } = await deleteGroupMembers(projectId, ownerUid, [uid]);
    if (!isOK) {
      return { isOK: false, message: t('hooks.message.failDeleteGroupMembers') };
    }
    return { isOK: true, message: '' };
  }, []);

  const updateE3kitGroupMembers = useCallback(async (originalProject: ProjectType, updateProject: ProjectType) => {
    const addedMembers = updateProject.membersUid.filter((d) => originalProject.membersUid.indexOf(d) === -1);
    const deletedMembers = originalProject.membersUid.filter((d) => updateProject.membersUid.indexOf(d) === -1);

    if (addedMembers.length > 0) {
      const addedResult = await addGroupMembers(updateProject.id, updateProject.ownerUid, addedMembers);
      if (!addedResult.isOK) {
        return { isOK: false, message: t('hooks.message.failAddGroupMembers'), project: updateProject };
      }
    }
    if (deletedMembers.length > 0) {
      const deletedResult = await deleteGroupMembers(updateProject.id, updateProject.ownerUid, deletedMembers);
      if (!deletedResult.isOK) {
        return { isOK: false, message: t('hooks.message.failDeleteGroupMembers'), project: updateProject };
      }
    }
    const members = cloneDeep(updateProject.members);
    const updatedMembers = members.map((d) => {
      if (d.verified === 'HOLD') {
        return { ...d, verified: 'OK' as VerifiedType };
      } else {
        return d;
      }
    });

    return { isOK: true, message: '', project: { ...updateProject, members: updatedMembers } };
  }, []);

  return {
    loadE3kitGroup,
    createE3kitGroup,
    updateE3kitGroupMembers,
    deleteE3kitGroupMembers,
    deleteE3kitGroup,
  } as const;
};

import { cloneDeep } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getUidsByEmails } from '../lib/firebase/firestore';
import { AppState } from '../modules';
import { editSettingsAction } from '../modules/settings';
import { CreateProjectType, ExportType, ProjectType, RegionType, VerifiedType } from '../types';
import { useRepository } from './useRepository';
import { useE3kitGroup } from './useE3kitGroup';
import { checkDuplicateMember, checkEmails } from '../utils/Project';
import { generateCSV, generateGeoJson, generateGPX } from '../utils/Geometry';
import { exportDataAndPhoto } from '../utils/File.web';
import dayjs from '../i18n/dayjs';
import { hasRegisterdUser } from '../lib/virgilsecurity/e3kit';
import { firestore } from '../lib/firebase/firebase';
import { t } from '../i18n/config';
import { Platform } from 'react-native';

export type UseProjectEditReturnType = {
  isProjectOpen: boolean;
  isOwner: boolean;
  isOwnerAdmin: boolean;
  isNew: boolean;
  targetProject: ProjectType;
  createType: CreateProjectType | undefined;
  ownerProjectNames: string[];
  copiedProjectName: string | undefined;
  isEdited: boolean;
  projectRegion: RegionType;
  openProject: (isSetting: boolean) => Promise<{
    isOK: boolean;
    message: string;
    region: RegionType | undefined;
  }>;
  deleteProject: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  exportProject: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  saveNewProject: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  saveProject: () => Promise<{
    isOK: boolean;
    message: string;
  }>;

  startProjectSetting: () => void;
  setCreateType: (type: CreateProjectType) => void;
  setCopiedProjectName: (itemValue: string) => void;
  changeText: (name: string, value: string) => void;
  changeMemberText: (value: string, idx: number) => void;
  changeAdmin: (checked: boolean, idx: number) => void;
  addMember: () => void;
  deleteMember: (idx: number) => void;
};

export const useProjectEdit = (
  initialProject: ProjectType,
  initialCreateType: CreateProjectType | undefined,
  isNew: boolean
): UseProjectEditReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: AppState) => state.user);

  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const projectRegion = useSelector((state: AppState) => state.settings.projectRegion);
  const currentProjectId = useSelector((state: AppState) => state.settings.projectId);
  const projects = useSelector((state: AppState) => state.projects);
  const [targetProject, setTargetProject] = useState<ProjectType>(initialProject);
  const [originalProject, setOriginalProject] = useState<ProjectType>(initialProject);
  const [createType, setCreateType] = useState<CreateProjectType | undefined>(initialCreateType);

  const [isEdited, setIsEdited] = useState(false);
  const isProjectOpen = useMemo(() => currentProjectId !== undefined, [currentProjectId]);

  const role = useMemo(
    () => targetProject.members.find((v) => v.uid === user.uid)?.role,
    [targetProject.members, user.uid]
  );
  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);
  const isOwner = useMemo(() => role === 'OWNER', [role]);
  const ownerProjectNames = useMemo(
    () => projects.filter((p) => p.ownerUid === user.uid).map((p: ProjectType) => p.name),
    [projects, user.uid]
  );
  const [copiedProjectName, setCopiedProjectName] = useState<string | undefined>(
    ownerProjectNames.length > 0 ? ownerProjectNames[0] : undefined
  );
  const {
    createProject,
    updateProject,
    deleteProject: deleteProjectFromRepository,
    fetchProjectSettings,
    fetchAllData,
    fetchAllPhotos,
    downloadProjectSettings,
    downloadAllData,
    downloadPublicAndCommonData,
    downloadCommonData,
    downloadPrivateData,
    downloadTemplateData,
  } = useRepository();

  const { loadE3kitGroup, createE3kitGroup, deleteE3kitGroup, updateE3kitGroupMembers } = useE3kitGroup();

  useEffect(() => {
    setTargetProject(initialProject);
    setCreateType(initialCreateType);
  }, [initialCreateType, initialProject]);

  const openProject = useCallback(
    async (isSetting: boolean) => {
      if (tracking !== undefined) {
        return { isOK: false, message: t('hooks.message.finishTrackking'), region: undefined };
      }

      //オープンするときは写真はダウンロードしない
      const shouldPhotoDownload = false;

      const { isOK: groupOK, message: groupMessage } = await loadE3kitGroup(targetProject);
      if (!groupOK) {
        return { isOK: false, message: groupMessage, region: undefined };
      }

      const { isOK: settingsOK, message: settingsMessage, region } = await downloadProjectSettings(targetProject);
      if (!settingsOK) {
        return { isOK: false, message: settingsMessage, region: undefined };
      }
      if (isOwnerAdmin && Platform.OS === 'web') {
        //オーナー＆管理者なら全員のデータをダウンロード
        if (isSetting) {
          const downloadCommonResult = await downloadCommonData(targetProject, shouldPhotoDownload);
          if (!downloadCommonResult.isOK) {
            return { isOK: false, message: downloadCommonResult.message, region: undefined };
          }
          const downloadTemplateResult = await downloadTemplateData(targetProject, shouldPhotoDownload, []);
          if (!downloadTemplateResult.isOK) {
            return { isOK: false, message: downloadTemplateResult.message, region: undefined };
          }
        } else {
          const { isOK: dataOK, message: dataMessage } = await downloadAllData(targetProject, shouldPhotoDownload);

          if (!dataOK) {
            return { isOK: false, message: dataMessage, region: undefined };
          }
        }
      } else {
        //オーナー＆管理者でなければ自分のデータをダウンロード
        const { isOK: publicAndCommonOK, message: publicAndCommonMessage } = await downloadPublicAndCommonData(
          targetProject,
          shouldPhotoDownload
        );
        if (!publicAndCommonOK) {
          return { isOK: false, message: publicAndCommonMessage, region: undefined };
        }
        const {
          isOK: privateOK,
          message: privateMessage,
          privateLayerIds,
        } = await downloadPrivateData(targetProject, shouldPhotoDownload);
        if (!privateOK || privateLayerIds === undefined) {
          return { isOK: false, message: privateMessage, region: undefined };
        }
        const downloadTemplateResult = await downloadTemplateData(targetProject, shouldPhotoDownload, privateLayerIds);
        if (!downloadTemplateResult.isOK) {
          return { isOK: false, message: downloadTemplateResult.message, region: undefined };
        }
      }

      dispatch(
        editSettingsAction({
          role: role,
          projectId: targetProject.id,
          projectName: targetProject.name,
          photosToBeDeleted: [],
        })
      );
      return { isOK: true, message: '', region };
    },
    [
      dispatch,
      downloadAllData,
      downloadCommonData,
      downloadPrivateData,
      downloadProjectSettings,
      downloadPublicAndCommonData,
      downloadTemplateData,
      isOwnerAdmin,
      loadE3kitGroup,
      role,
      targetProject,
      tracking,
    ]
  );

  const deleteProject = useCallback(async () => {
    //ToDo 消した後に他のユーザーがアップロード、ダウンロードした時のエラー処理
    const { isOK: projectOK, message: projectMessage } = await deleteProjectFromRepository(targetProject);
    if (!projectOK) {
      return { isOK: false, message: projectMessage };
    }
    const { isOK: groupOK, message: groupMessage } = await deleteE3kitGroup(targetProject);
    if (!groupOK) {
      return { isOK: false, message: groupMessage };
    }
    return { isOK: true, message: '' };
  }, [deleteE3kitGroup, deleteProjectFromRepository, targetProject]);

  const exportProject = useCallback(async () => {
    //console.log(targetProject);
    //自分が管理者のプロジェクトしかエクスポートできない。管理者以外はエクスポートボタン表示されない.
    const {
      isOK: projectOK,
      message: projectMessage,
      data: projectSettings,
    } = await fetchProjectSettings(targetProject);
    if (!projectOK || projectSettings === undefined) {
      return { isOK: false, message: projectMessage };
    }
    const { isOK: dataOK, message: dataMessage, data: dataSet } = await fetchAllData(targetProject);
    if (!dataOK || dataSet === undefined) {
      return { isOK: false, message: dataMessage };
    }

    const exportData: { data: string; name: string; type: ExportType | 'JSON' | 'PHOTO'; folder: string }[] = [];
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const settingsData = JSON.stringify({ projectSettings, dataSet });
    const settingsDataName = `${targetProject.name}_${time}.json`;
    exportData.push({ data: settingsData, name: settingsDataName, type: 'JSON', folder: '' });

    for (const layer of projectSettings.layers) {
      const records = dataSet.map((d) => (d.layerId === layer.id ? d.data.map((v) => v) : [])).flat();
      //GeoJSON
      const geojson = generateGeoJson(records, layer.field, layer.type, layer.name);
      const geojsonData = JSON.stringify(geojson);
      const geojsonName = `${layer.name}_${time}.geojson`;
      exportData.push({ data: geojsonData, name: geojsonName, type: 'GeoJSON', folder: `${layer.name}` });
      //CSV
      const csv = generateCSV(records, layer.field, layer.type);
      const csvData = csv;
      const csvName = `${layer.name}_${time}.csv`;
      exportData.push({ data: csvData, name: csvName, type: 'CSV', folder: `${layer.name}` });
      //GPX
      if (layer.type === 'POINT' || layer.type === 'LINE') {
        const gpx = generateGPX(records, layer.type);
        const gpxData = gpx;
        const gpxName = `${layer.name}_${time}.gpx`;
        exportData.push({ data: gpxData, name: gpxName, type: 'GPX', folder: `${layer.name}` });
      }
      //Photo
      const imagePromises = fetchAllPhotos(layer, records);
      const photos = await Promise.all(imagePromises);
      photos.forEach((photo) => {
        photo !== undefined &&
          exportData.push({ data: photo.data, name: photo.name, type: 'PHOTO', folder: `${layer.name}` });
      });
    }
    const exportDataName = `${targetProject.name}_${time}`;
    const isOK = await exportDataAndPhoto(exportData, exportDataName, 'zip');
    if (!isOK) {
      return { isOK: false, message: t('hooks.message.failSaveFile') };
    }
    return { isOK: true, message: '' };
  }, [fetchAllData, fetchAllPhotos, fetchProjectSettings, targetProject]);

  const updateProjectMembers = useCallback(
    (uids: (string | null)[], hasRegisterd: boolean[]): ProjectType => {
      const updatedProject = cloneDeep(targetProject);
      const members = updatedProject.members.map((member, idx) =>
        hasRegisterd[idx]
          ? { ...member, uid: uids[idx], verified: 'HOLD' as VerifiedType }
          : { ...member, uid: null, verified: 'NO_ACCOUNT' as VerifiedType }
      );
      const membersUid = members.map((v) => v.uid).filter((v): v is string => v !== null);
      const adminsUid = members
        .map((v) => (v.role === 'OWNER' || v.role === 'ADMIN') && v.uid)
        .filter((v): v is string => !!v);

      return { ...updatedProject, membersUid, adminsUid, members: members };

      // ToDo ここの処理をどうするか考える.不要になった？
      //
      // //まだグループに入っていないかもしれないが、ローテーションしたユーザーのために一旦削除処理する。エラーは無視。
      // const { isOK: deleteOK, message: deleteMessage } = await deleteE3kitGroupMembers(
      //   targetProject.id,
      //   targetProject.ownerUid,
      //   uid
      // );
      // if (!deleteOK) {
      //   console.log(deleteMessage);
      // }
    },
    [targetProject]
  );

  const checkRegisterdUser = useCallback(async (uids: (string | null)[]) => {
    const registerd = await Promise.all(uids.map(async (uid) => hasRegisterdUser(uid)));
    const hasInvalidAccount = !registerd.every((v) => v === true);
    return { registerd, hasInvalidAccount };
  }, []);

  const checkProject = useCallback(async () => {
    if (targetProject.name.trim() === '') {
      return { isOK: false, message: t('hooks.message.inputProjectName') };
    }
    if (originalProject.name !== targetProject.name && projects.find((d) => d.name === targetProject.name)) {
      //ToDo 取得後の変更で重複するエラーを防ぐ（まれだと思うが）
      return { isOK: false, message: t('hooks.message.changeProjectName') };
    }

    for (const [idx] of targetProject.members.entries()) {
      if (!checkDuplicateMember(targetProject, idx)) {
        return { isOK: false, message: t('hooks.message.duplicateMembers') };
      }
    }
    const { isOK: emailOK, emails } = checkEmails(targetProject);
    if (!emailOK) {
      return {
        isOK: false,
        message: t('hooks.message.invalidEmail'),
      };
    }
    const uids = await getUidsByEmails(emails);
    if (uids === undefined) {
      return { isOK: false, message: t('hooks.message.failUserCheck') };
    }
    const { registerd, hasInvalidAccount } = await checkRegisterdUser(uids);
    const updatedProject = updateProjectMembers(uids, registerd);
    if (hasInvalidAccount) {
      //
      setTargetProject(updatedProject);
      return {
        isOK: false,
        message: t('hooks.message.invalidAccount'),
        project: updatedProject,
      };
    }
    return {
      isOK: true,
      message: '',
      project: updatedProject,
    };
  }, [checkRegisterdUser, originalProject.name, projects, targetProject, updateProjectMembers]);

  const saveNewProject = useCallback(async () => {
    if (createType === 'COPY' && copiedProjectName === undefined) {
      return { isOK: false, message: t('hooks.message.noCopyProject') };
    }
    const { isOK, message, project } = await checkProject();
    if (!isOK || project === undefined) {
      return { isOK: false, message };
    }
    const { isOK: groupOK, message: groupMessage, project: updatedProject } = await createE3kitGroup(project);
    if (!groupOK) {
      return { isOK: false, message: groupMessage };
    }
    const isPhotoUpload = true; //コモンデータの写真もあればコピーする
    const { isOK: createOK, message: createMessage } = await createProject(
      updatedProject,
      createType,
      isPhotoUpload,
      copiedProjectName
    );
    if (!createOK) {
      return { isOK: false, message: createMessage };
    }
    //functionsでプロジェクトのライセンスが更新されるまで待つ
    return await new Promise<{ isOK: boolean; message: string }>((resolve) => {
      //@ts-ignore
      const unsubscribe = firestore.doc(`projects/${project.id}`).onSnapshot(async (snapshot) => {
        if (!snapshot.exists) return;
        const license = snapshot.get('license');
        if (license !== undefined && license !== 'Unknown') {
          unsubscribe();
          resolve({ isOK: true, message: '' });
        }
      });
    });
  }, [checkProject, copiedProjectName, createE3kitGroup, createProject, createType]);

  const saveProject = useCallback(async () => {
    const { isOK: checkOK, message: checkMessage, project } = await checkProject();
    if (!checkOK || project === undefined) {
      return { isOK: false, message: checkMessage };
    }

    const {
      isOK: groupOK,
      message: groupMessage,
      project: updatedProject,
    } = await updateE3kitGroupMembers(originalProject, project);
    if (!groupOK) {
      return { isOK: false, message: groupMessage };
    }
    const { isOK: projectOK, message: projectMessage } = await updateProject(updatedProject);
    if (!projectOK) {
      return { isOK: false, message: projectMessage };
    }
    setIsEdited(false);
    setTargetProject(updatedProject);
    setOriginalProject(updatedProject);
    return { isOK: true, message: t('hooks.message.updateProjectInfo') };
  }, [checkProject, originalProject, updateE3kitGroupMembers, updateProject]);

  const startProjectSetting = useCallback(() => {
    dispatch(editSettingsAction({ isSettingProject: true }));
  }, [dispatch]);

  const changeText = useCallback(
    (name: string, value: string) => {
      if (name === 'abstract' && targetProject.abstract !== value) {
        setTargetProject({ ...targetProject, abstract: value });
        setIsEdited(true);
      } else if (name === 'name' && targetProject.name !== value) {
        setTargetProject({ ...targetProject, name: value });
        setIsEdited(true);
      }
    },
    [targetProject]
  );

  const changeMemberText = useCallback(
    (value: string, idx: number) => {
      const members = cloneDeep(targetProject.members);
      members[idx].email = value;
      setTargetProject({ ...targetProject, members: members });
      setIsEdited(true);
    },
    [targetProject]
  );

  const changeAdmin = useCallback(
    (checked: boolean, idx: number) => {
      const members = cloneDeep(targetProject.members);
      members[idx].role = checked ? 'ADMIN' : 'MEMBER';
      const adminsUid = members
        .map((v) => (v.role === 'OWNER' || v.role === 'ADMIN') && v.uid)
        .filter((v): v is string => !!v);
      setTargetProject({ ...targetProject, adminsUid, members });
      setIsEdited(true);
    },
    [targetProject]
  );

  const addMember = useCallback(() => {
    const members = cloneDeep(targetProject.members);
    members.push({ uid: '', email: '', verified: 'NO_ACCOUNT', role: 'MEMBER' });
    setTargetProject({ ...targetProject, members });
    setIsEdited(true);
  }, [targetProject]);

  const deleteMember = useCallback(
    (idx: number) => {
      const members = cloneDeep(targetProject.members);
      members.splice(idx, 1);
      const membersUid = members.map((v) => v.uid).filter((v): v is string => v !== null);
      const adminsUid = members
        .map((v) => (v.role === 'OWNER' || v.role === 'ADMIN') && v.uid)
        .filter((v): v is string => !!v);
      setTargetProject({ ...targetProject, membersUid, adminsUid, members });
      setIsEdited(true);
    },
    [targetProject]
  );

  return {
    isProjectOpen,
    isOwner,
    isOwnerAdmin,
    isNew,
    targetProject,
    createType,
    ownerProjectNames,
    copiedProjectName,
    isEdited,
    projectRegion,
    openProject,
    deleteProject,
    exportProject,

    saveNewProject,
    saveProject,
    startProjectSetting,
    setCopiedProjectName,
    changeText,
    changeMemberText,
    changeAdmin,
    setCreateType,
    addMember,
    deleteMember,
  } as const;
};

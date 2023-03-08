import { cloneDeep } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getUidsByEmails } from '../lib/firebase/firestore';
import { AppState } from '../modules';
import { editSettingsAction } from '../modules/settings';
import {
  CreateProjectType,
  DataType,
  ExportType,
  ProjectSettingsType,
  ProjectType,
  RegionType,
  VerifiedType,
} from '../types';
import { useRepository } from './useRepository';
import { checkDuplicateMember, checkEmails } from '../utils/Project';
import { generateCSV, generateGeoJson, generateGPX } from '../utils/Geometry';
import dayjs from '../i18n/dayjs';
import { hasRegisterdUser } from '../lib/virgilsecurity/e3kit';
import { t } from '../i18n/config';
import { isLoggedIn } from '../utils/Account';

export type UseProjectEditReturnType = {
  isProjectOpen: boolean;
  isOwner: boolean;
  isOwnerAdmin: boolean;
  isNew: boolean;
  originalProject: ProjectType;
  targetProject: ProjectType;
  createType: CreateProjectType | undefined;
  ownerProjectNames: string[];
  copiedProjectName: string | undefined;
  isEdited: boolean;
  projectRegion: RegionType;
  checkedProject: () => Promise<{
    isOK: boolean;
    message: string;
    project: ProjectType | undefined;
  }>;
  openProject: () => void;
  generateExportProjectData: (
    projectSettings: ProjectSettingsType,
    dataSet: DataType[]
  ) => Promise<{
    exportData: {
      data: string;
      name: string;
      type: ExportType | 'JSON' | 'PHOTO';
      folder: string;
    }[];
    exportDataName: string;
  }>;

  saveProject: (updatedProject: ProjectType) => void;

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
  const { fetchAllPhotos } = useRepository();

  useEffect(() => {
    setTargetProject(initialProject);
    setCreateType(initialCreateType);
  }, [initialCreateType, initialProject]);

  const generateExportProjectData = useCallback(
    async (projectSettings: ProjectSettingsType, dataSet: DataType[]) => {
      //console.log(targetProject);
      //自分が管理者のプロジェクトしかエクスポートできない。管理者以外はエクスポートボタン表示されない.

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
      return { exportData, exportDataName };
    },
    [fetchAllPhotos, targetProject]
  );

  const startProjectSetting = useCallback(() => {
    dispatch(editSettingsAction({ isSettingProject: true }));
  }, [dispatch]);

  const openProject = useCallback(() => {
    //オープンするときは写真はダウンロードしない
    if (!isLoggedIn(user)) throw new Error('no user');
    dispatch(
      editSettingsAction({
        role: role,
        projectId: targetProject.id,
        projectName: targetProject.name,
        photosToBeDeleted: [],
      })
    );
  }, [dispatch, role, targetProject.id, targetProject.name, user]);

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

  const checkedProject = useCallback(async () => {
    if (targetProject.name.trim() === '') {
      return { isOK: false, message: t('hooks.message.inputProjectName'), project: undefined };
    }
    if (originalProject.name !== targetProject.name && projects.find((d) => d.name === targetProject.name)) {
      //ToDo 取得後の変更で重複するエラーを防ぐ（まれだと思うが）
      return { isOK: false, message: t('hooks.message.changeProjectName'), project: undefined };
    }

    for (const [idx] of targetProject.members.entries()) {
      if (!checkDuplicateMember(targetProject, idx)) {
        return { isOK: false, message: t('hooks.message.duplicateMembers'), project: undefined };
      }
    }
    const { isOK: emailOK, emails } = checkEmails(targetProject);
    if (!emailOK) {
      return {
        isOK: false,
        message: t('hooks.message.invalidEmail'),
        project: undefined,
      };
    }
    const uids = await getUidsByEmails(emails);
    if (uids === undefined) {
      return { isOK: false, message: t('hooks.message.failUserCheck'), project: undefined };
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

  const saveProject = useCallback((updatedProject: ProjectType) => {
    setIsEdited(false);
    setTargetProject(updatedProject);
    setOriginalProject(updatedProject);
  }, []);

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
    originalProject,
    createType,
    ownerProjectNames,
    copiedProjectName,
    isEdited,
    projectRegion,
    checkedProject,
    openProject,
    generateExportProjectData,
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

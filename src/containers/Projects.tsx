import React, { useCallback, useEffect } from 'react';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync } from '../components/molecules/AlertAsync';
import Projects from '../components/pages/Projects';
import { useScreen } from '../hooks/useScreen';
import { useProjects } from '../hooks/useProjects';
import { usePurchasesWeb } from '../hooks/usePurchasesWeb';
import { t } from '../i18n/config';
import { Props_Projects } from '../routes';
import { validateProjectLicense } from '../utils/Project';
import { ProjectsContext } from '../contexts/Projects';
import { AppState } from '../modules';
import { useSelector } from 'react-redux';
import { hasLoggedIn } from '../utils/Account';
import { usePermission } from '../hooks/usePermission';

export default function ProjectsContainers({ navigation, route }: Props_Projects) {
  const user = useSelector((state: AppState) => state.user);
  const { isSettingProject } = usePermission();
  const { isLoading, projects, getOwnerProjectsCount, fetchProjects, generateProject } = useProjects();
  const { customerLicense } = usePurchasesWeb();
  const { closeData } = useScreen();

  const pressAddProject = useCallback(() => {
    if (!hasLoggedIn(user)) {
      Alert.alert('', t('hooks.message.pleaseLogin'));
      return;
    }
    if (isSettingProject) {
      Alert.alert('', t('hooks.message.cannotAddProject'));
      return;
    }
    const projectsCount = getOwnerProjectsCount(user);
    const { isOK: licenseIsOK, message: licenseMessage } = validateProjectLicense(customerLicense, projectsCount);
    if (!licenseIsOK) {
      Alert.alert('', licenseMessage + t('Projects.alert.addProject'));
      return;
    }
    navigation.navigate('ProjectEdit', {
      previous: 'Projects',
      project: generateProject(user),
      isNew: true,
      createType: 'DEFAULT',
    });
  }, [customerLicense, generateProject, getOwnerProjectsCount, isSettingProject, navigation, user]);

  const gotoBack = useCallback(async () => {
    closeData();
    navigation.navigate('Home');
  }, [closeData, navigation]);

  const gotoProject = useCallback(
    (index: number) => {
      navigation.navigate('ProjectEdit', { previous: 'Projects', project: projects[index], isNew: false });
    },
    [navigation, projects]
  );

  const reloadProjects = useCallback(async () => {
    if (!hasLoggedIn(user)) {
      Alert.alert('', t('hooks.message.pleaseLogin'));
      return;
    }
    const { isOK, message } = await fetchProjects(user);
    if (!isOK) {
      await AlertAsync(message);
    }
  }, [fetchProjects, user]);

  useEffect(() => {
    if (projects.length === 0 || route.params?.reload) {
      reloadProjects();
      navigation.setParams({ reload: undefined });
    }
  }, [navigation, projects.length, reloadProjects, route.params?.reload]);

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        user,
        isLoading,
        onReloadProjects: reloadProjects,
        gotoProject,
        pressAddProject,
        gotoBack,
      }}
    >
      <Projects />
    </ProjectsContext.Provider>
  );
}

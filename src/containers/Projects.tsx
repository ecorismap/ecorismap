import React, { useState, useCallback, useEffect } from 'react';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync } from '../components/molecules/AlertAsync';
import Projects from '../components/pages/Projects';
import { useScreen } from '../hooks/useScreen';
import { useProjects } from '../hooks/useProjects';
import { usePurchasesWeb } from '../hooks/usePurchasesWeb';
import { t } from '../i18n/config';
import { Props_Projects } from '../routes';
import { validateProjectLicense } from '../utils/Project';

export default function ProjectsContainers({ navigation, route }: Props_Projects) {
  const { projects, user, ownerProjectsCount, fetchProjects, addProject } = useProjects();
  const { customerLicense } = usePurchasesWeb();
  const { closeData } = useScreen();

  const [isLoading, setIsLoading] = useState(false);

  const pressAddProject = useCallback(() => {
    const { isOK: licenseIsOK, message: licenseMessage } = validateProjectLicense(customerLicense, ownerProjectsCount);
    if (!licenseIsOK) {
      Alert.alert('', licenseMessage + t('Projects.alert.addProject'));
      return;
    }
    const { isOK, message, project } = addProject();
    if (!isOK || project === undefined) {
      Alert.alert('', message);
      return;
    }
    navigation.navigate('ProjectEdit', {
      previous: 'Projects',
      project: project,
      isNew: true,
      createType: 'DEFAULT',
    });
  }, [addProject, customerLicense, navigation, ownerProjectsCount]);

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
    setIsLoading(true);
    const { isOK, message } = await fetchProjects();
    setIsLoading(false);
    if (!isOK) {
      await AlertAsync(message);
    }
  }, [fetchProjects]);

  useEffect(() => {
    if (projects.length === 0 || route.params?.reload) {
      reloadProjects();
      navigation.setParams({ reload: undefined });
    }
  }, [navigation, projects.length, reloadProjects, route.params?.reload]);

  return (
    <Projects
      projects={projects}
      user={user}
      isLoading={isLoading}
      onReloadProjects={reloadProjects}
      gotoProject={gotoProject}
      pressAddProject={pressAddProject}
      gotoBack={gotoBack}
    />
  );
}

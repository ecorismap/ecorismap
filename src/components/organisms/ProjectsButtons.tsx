import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FUNC_CREATE_PROJECT_BY_MOBILE, PROJECTS_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

interface Props {
  createProject: () => void;
  reloadProjects: () => void;
}
export const ProjectsButtons = (props: Props) => {
  const { createProject, reloadProjects } = props;
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.buttonContainer, { bottom: insets.bottom }]}>
      <Button name={PROJECTS_BTN.RELOAD} onPress={reloadProjects} labelText={t('Projects.label.reloadProjects')} />
      {(Platform.OS === 'web' || FUNC_CREATE_PROJECT_BY_MOBILE) && (
        <Button name={PROJECTS_BTN.ADD} onPress={createProject} labelText={t('Projects.label.createProject')} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-start',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 20,
  },
});

import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, PROJECTEDIT_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';

interface Props {
  disabled: boolean;
  isNew: boolean;
  isProjectOpen: boolean;
  isOwnerAdmin: boolean;
  onPressOpenProject: () => void;
  onPressDeleteProject: () => void;
  onPressExportProject: () => void;
  onPressSettingProject: () => void;
}
export const ProjectEditButtons = React.memo((props: Props) => {
  const {
    disabled,
    isNew,
    isProjectOpen,
    isOwnerAdmin,
    onPressOpenProject,
    onPressDeleteProject,
    onPressExportProject,
    onPressSettingProject,
  } = props;

  return (
    <View style={styles.buttonContainer}>
      {!isNew && (
        <View style={{ marginHorizontal: 9 }}>
          <Button
            name={PROJECTEDIT_BTN.OPEN}
            onPress={onPressOpenProject}
            backgroundColor={disabled ? COLOR.LIGHTBLUE : COLOR.BLUE}
            disabled={disabled}
          />
        </View>
      )}
      {!isNew && isOwnerAdmin && Platform.OS === 'web' && (
        <Button
          name={PROJECTEDIT_BTN.SETTING}
          onPress={onPressSettingProject}
          disabled={isProjectOpen || disabled}
          backgroundColor={isProjectOpen || disabled ? COLOR.LIGHTBLUE : COLOR.BLUE}
        />
      )}
      {!isNew && isOwnerAdmin && Platform.OS === 'web' && (
        <View style={{ marginHorizontal: 9 }}>
          <Button
            name={PROJECTEDIT_BTN.EXPORT}
            backgroundColor={isProjectOpen || disabled ? COLOR.LIGHTBLUE : COLOR.BLUE}
            disabled={isProjectOpen || disabled}
            onPress={onPressExportProject}
          />
        </View>
      )}
      {!isNew && isOwnerAdmin && Platform.OS === 'web' && (
        <View style={{ marginHorizontal: 9 }}>
          <Button
            name={PROJECTEDIT_BTN.DELETE}
            backgroundColor={isProjectOpen || disabled ? COLOR.LIGHTBLUE : COLOR.DARKRED}
            disabled={isProjectOpen || disabled}
            onPress={onPressDeleteProject}
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-end',
    elevation: 101,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 35,
    zIndex: 101,
  },
});

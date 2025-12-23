import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLOR, PROJECTEDIT_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

interface Props {
  disabled: boolean;
  isNew: boolean;
  isOwnerAdmin: boolean;
  onPressOpenProject: () => void;
  onPressDeleteProject: () => void;
  onPressExportProject: () => void;
  onPressSettingProject: () => void;
  onPressCloudDataManagement: () => void;
}
export const ProjectEditButtons = React.memo((props: Props) => {
  const {
    disabled,
    isNew,
    isOwnerAdmin,
    onPressOpenProject,
    onPressDeleteProject,
    onPressExportProject,
    onPressSettingProject,
    onPressCloudDataManagement,
  } = props;
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.buttonContainer,
        Platform.OS === 'web' ? { marginVertical: 15 } : { marginTop: 20, marginBottom: insets.bottom + 15 },
      ]}
    >
      {!isNew && (
        <View style={{ marginHorizontal: 9 }}>
          <Button
            name={PROJECTEDIT_BTN.OPEN}
            onPress={onPressOpenProject}
            backgroundColor={disabled ? COLOR.LIGHTBLUE : COLOR.BLUE}
            disabled={disabled}
            labelText={t('ProjectEdit.label.open')}
          />
        </View>
      )}
      {!isNew && isOwnerAdmin && Platform.OS === 'web' && (
        <Button
          name={PROJECTEDIT_BTN.SETTING}
          onPress={onPressSettingProject}
          disabled={disabled}
          backgroundColor={disabled ? COLOR.LIGHTBLUE : COLOR.BLUE}
          labelText={t('ProjectEdit.label.setting')}
        />
      )}
      {!isNew && isOwnerAdmin && Platform.OS === 'web' && (
        <View style={{ marginHorizontal: 9 }}>
          <Button
            name={PROJECTEDIT_BTN.DATA_MANAGE}
            onPress={onPressCloudDataManagement}
            disabled={disabled}
            backgroundColor={disabled ? COLOR.LIGHTBLUE : COLOR.BLUE}
            labelText={t('ProjectEdit.label.dataManage')}
            labelFontSize={6}
          />
        </View>
      )}
      {!isNew && isOwnerAdmin && Platform.OS === 'web' && (
        <View style={{ marginHorizontal: 9 }}>
          <Button
            name={PROJECTEDIT_BTN.EXPORT}
            backgroundColor={disabled ? COLOR.LIGHTBLUE : COLOR.BLUE}
            disabled={disabled}
            onPress={onPressExportProject}
            labelText={t('ProjectEdit.label.export')}
          />
        </View>
      )}
      {!isNew && isOwnerAdmin && Platform.OS === 'web' && (
        <View style={{ marginHorizontal: 9 }}>
          <Button
            name={PROJECTEDIT_BTN.DELETE}
            backgroundColor={disabled ? COLOR.LIGHTBLUE : COLOR.DARKRED}
            disabled={disabled}
            onPress={onPressDeleteProject}
            labelText={t('ProjectEdit.label.delete')}
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-start',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    zIndex: 101,
  },
});

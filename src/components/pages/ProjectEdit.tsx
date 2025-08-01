import React, { useCallback, useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLOR, PROJECTEDIT_BTN } from '../../constants/AppConstants';
import HeaderRightButton from '../molecules/HeaderRightButton';
import { ProjectEditButtons } from '../organisms/ProjectEditButtons';
import { ProjectEditMembers } from '../organisms/ProjectEditMembers';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { EditString } from '../molecules/EditString';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { ProjectEditContext } from '../../contexts/ProjectEdit';

export default function ProjectEditScreen() {
  const {
    isNew,
    isProjectOpen,
    project,
    isEdited,
    isOwner,
    isOwnerAdmin,
    isLoading,
    changeText,
    changeMemberText,
    changeAdmin,
    pressAddMembers,
    pressDeleteMember,
    pressSaveProject,
    pressOpenProject,
    pressExportProject,
    pressDeleteProject,
    pressSettingProject,
    gotoBack,
  } = useContext(ProjectEditContext);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const styles = StyleSheet.create({
    container: {
      backgroundColor: COLOR.MAIN,
      flex: 1,
    },
  });
  const [emails, setEmails] = useState('');

  const headerLeftButton = useCallback(
    (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      //@ts-ignore
      <HeaderBackButton {...props} labelVisible={false} onPress={gotoBack} />
    ),
    [gotoBack]
  );

  const headerRightButton = useCallback(
    () => (
      <View style={{ flexDirection: 'row' }}>
        {(isOwnerAdmin || isNew) && (
          <HeaderRightButton
            name={PROJECTEDIT_BTN.SAVE}
            onPress={pressSaveProject}
            backgroundColor={isEdited ? COLOR.BLUE : COLOR.LIGHTBLUE}
            disabled={!isEdited}
            labelText={t('ProjectEdit.label.save')}
          />
        )}
      </View>
    ),
    [isEdited, isNew, isOwnerAdmin, pressSaveProject]
  );

  const customHeader = useCallback(
    () => (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 56 + insets.top,
          backgroundColor: COLOR.MAIN,
          paddingHorizontal: 10,
          paddingTop: insets.top,
        }}
      >
        {headerLeftButton({} as HeaderBackButtonProps)}
        <Text style={{ fontSize: 16 }}>{t('ProjectEdit.navigation.title')}</Text>
        {headerRightButton()}
      </View>
    ),
    [headerLeftButton, headerRightButton, insets.top]
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1, marginBottom: insets.bottom }}>
        <EditString
          name={t('common.projectName')}
          value={project.name}
          editable={(isOwner && !isProjectOpen) || isNew}
          onChangeText={(value) => changeText('name', value)}
          onEndEditing={() => null}
        />
        <EditString
          name={t('common.overview')}
          value={project.abstract}
          editable={(isOwner && !isProjectOpen) || isNew}
          onChangeText={(value) => changeText('abstract', value)}
          onEndEditing={() => null}
        />

        {(isOwner || isNew) && (
          <EditString
            name={t('common.addMembers')}
            value={emails}
            style={{ backgroundColor: COLOR.WHITE, borderRadius: 5, flex: 1 }}
            editable={true}
            onChangeText={setEmails}
            onEndEditing={() => {
              pressAddMembers(emails);
              setEmails('');
            }}
          />
        )}
        {isOwnerAdmin &&
          project.members.map((member, idx) => {
            return (
              <ProjectEditMembers
                key={idx}
                name={member.role === 'OWNER' ? t('common.owner') : t('common.member')}
                value={member.email}
                verified={member.verified}
                role={member.role}
                editable={(isOwner && !isProjectOpen && idx !== 0) || (isNew && idx !== 0)}
                visibleMinus={member.role !== 'OWNER' && !isProjectOpen && (isOwner || isNew)}
                onCheckAdmin={(checked) => changeAdmin(checked, idx)}
                onChangeText={(value) => changeMemberText(value, idx)}
                pressDeleteMember={(isOwner && !isProjectOpen) || isNew ? () => pressDeleteMember(idx) : () => null}
              />
            );
          })}
      </ScrollView>
      <Loading visible={isLoading} text="" />
      <ProjectEditButtons
        disabled={isEdited}
        isNew={isNew}
        isOwnerAdmin={isOwnerAdmin}
        onPressOpenProject={() => pressOpenProject(false)}
        onPressDeleteProject={pressDeleteProject}
        onPressExportProject={pressExportProject}
        onPressSettingProject={pressSettingProject}
      />
    </View>
  );
}

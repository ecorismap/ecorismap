import React, { useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { COLOR, CREATEPROJECTTYPE, PROJECTEDIT_BTN } from '../../constants/AppConstants';
import HeaderRightButton from '../molecules/HeaderRightButton';
import { ProjectEditButtons } from '../organisms/ProjectEditButtons';
import { ProjectNamePicker } from '../organisms/ProjecEditProjectNamePicker';
import { ProjectEditRadio } from '../organisms/ProjectEditRadio';
import { ProjectEditMembers } from '../organisms/ProjectEditMembers';
import { CreateProjectType, ProjectType } from '../../types';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { EditString } from '../molecules/EditString';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';

interface Props {
  createType: CreateProjectType | undefined;
  isNew: boolean;
  isProjectOpen: boolean;
  project: ProjectType;
  isOwner: boolean;
  isOwnerAdmin: boolean;
  isEdited: boolean;
  isLoading: boolean;
  pickerValue: string;
  pickerItems: string[] | undefined;
  changeText: (name: string, value: string) => void;
  changeCreateType: (value: CreateProjectType) => void;
  changeDuplicateProjectName: (itemValue: string, itemIndex: number) => void;
  changeMemberText: (value: string, idx: number) => void;
  changeAdmin: (checked: boolean, idx: number) => void;
  pressAddMember: () => void;
  pressDeleteMember: (idx: number) => void;
  pressSaveProject: () => void;
  pressOpenProject: () => void;
  pressExportProject: () => void;
  pressDeleteProject: () => void;
  pressSettingProject: () => void;
  gotoBack: () => void;
}

export default function ProjectEditScreen(props: Props) {
  const {
    createType,
    isNew,
    isProjectOpen,
    project,
    isEdited,
    isOwner,
    isOwnerAdmin,
    isLoading,
    pickerValue,
    pickerItems,
    changeText,
    changeDuplicateProjectName,
    changeCreateType,
    changeMemberText,
    changeAdmin,
    pressAddMember,
    pressDeleteMember,
    pressSaveProject,
    pressOpenProject,
    pressExportProject,
    pressDeleteProject,
    pressSettingProject,
    gotoBack,
  } = props;
  const navigation = useNavigation();
  const styles = StyleSheet.create({
    container: {
      backgroundColor: COLOR.MAIN,
      flex: 1,
      justifyContent: 'flex-end',
    },
  });

  const headerLeftButton = useCallback(
    // eslint-disable-next-line no-shadow
    (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props} onPress={gotoBack} />,
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
          />
        )}
      </View>
    ),
    [isEdited, isNew, isOwnerAdmin, pressSaveProject]
  );

  useEffect(() => {
    navigation.setOptions({
      // eslint-disable-next-line no-shadow
      headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props),
      headerBackTitle: t('common.back'),
      headerRight: () => headerRightButton(),
    });
  }, [headerLeftButton, headerRightButton, isEdited, isNew, isOwnerAdmin, navigation, pressSaveProject]);

  const createTypeValueList = useMemo(() => Object.keys(CREATEPROJECTTYPE) as CreateProjectType[], []);
  const createTypeLabels = useMemo(() => Object.values(CREATEPROJECTTYPE), []);

  return (
    <View style={styles.container}>
      <ScrollView>
        {isNew && createType !== undefined && (
          <ProjectEditRadio
            name={t('common.preparation')}
            value={createType}
            list={createTypeValueList}
            labels={createTypeLabels}
            onValueChange={changeCreateType}
          />
        )}
        {createType === 'COPY' && pickerItems !== undefined && (
          <ProjectNamePicker
            label={t('common.copySource')}
            value={pickerValue}
            pickerItems={pickerItems}
            onValueChange={changeDuplicateProjectName}
          />
        )}
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
                visiblePlus={member.role === 'OWNER' && (isOwner || isNew)}
                visibleMinus={member.role !== 'OWNER' && (isOwner || isNew)}
                onCheckAdmin={(checked) => changeAdmin(checked, idx)}
                onChangeText={(value) => changeMemberText(value, idx)}
                pressAddMember={(isOwner && !isProjectOpen) || isNew ? pressAddMember : () => null}
                pressDeleteMember={(isOwner && !isProjectOpen) || isNew ? () => pressDeleteMember(idx) : () => null}
              />
            );
          })}
      </ScrollView>
      <Loading visible={isLoading} text="" />
      <ProjectEditButtons
        isNew={isNew}
        isProjectOpen={isProjectOpen}
        isOwnerAdmin={isOwnerAdmin}
        onPressOpenProject={pressOpenProject}
        onPressDeleteProject={pressDeleteProject}
        onPressExportProject={pressExportProject}
        onPressSettingProject={pressSettingProject}
      />
    </View>
  );
}

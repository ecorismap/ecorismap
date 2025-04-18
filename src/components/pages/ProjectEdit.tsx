import React, { useCallback, useContext, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Modal, Text, Button } from 'react-native';
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
  const styles = StyleSheet.create({
    container: {
      backgroundColor: COLOR.MAIN,
      flex: 1,
      justifyContent: 'flex-end',
    },
  });
  const [emails, setEmails] = useState('');

  const headerLeftButton = useCallback(
    (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
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

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props),
      headerBackTitle: t('common.back'),
      headerRight: () => headerRightButton(),
    });
  }, [headerLeftButton, headerRightButton, isEdited, isNew, isOwnerAdmin, navigation, pressSaveProject]);

  return (
    <View style={styles.container}>
      <ScrollView>
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

// カラー定数を定義
const MODAL_OVERLAY_COLOR = 'rgba(0,0,0,0.5)';
const MODAL_BG_COLOR = '#fff';
const MODAL_BORDER_COLOR = '#eee';

// 競合解決用モーダル
const modalStyles = StyleSheet.create({
  bold: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  candidate: {
    borderBottomWidth: 1,
    borderColor: MODAL_BORDER_COLOR,
    marginBottom: 12,
  },
  candidateField: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  modal: {
    backgroundColor: MODAL_BG_COLOR,
    borderRadius: 8,
    minWidth: 300,
    padding: 20,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: MODAL_OVERLAY_COLOR,
    flex: 1,
    justifyContent: 'center',
  },
});

export function ConflictResolverModal({
  visible,
  candidates,
  id,
  onSelect,
  onBulkSelect,
  onClose,
}: {
  visible: boolean;
  candidates: any[];
  id: string;
  onSelect: (c: any) => void;
  onBulkSelect: (mode: 'self' | 'latest') => void;
  onClose: () => void;
}) {
  // manual戦略・latest戦略・self戦略すべてに対応
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={modalStyles.overlay}>
        <View style={modalStyles.modal}>
          <Text style={modalStyles.bold}>{`競合データID: ${id}`}</Text>
          <ScrollView style={{ maxHeight: 300 }}>
            {candidates.map((c, idx) => (
              <View key={idx} style={modalStyles.candidate}>
                <Text>{`編集者: ${c.displayName} / 更新日時: ${c.updatedAt}`}</Text>
                <Text selectable style={modalStyles.candidateField}>
                  {JSON.stringify(c.field, null, 2)}
                </Text>
                <Button title="このデータを採用" onPress={() => onSelect(c)} />
              </View>
            ))}
          </ScrollView>
          <Button title="残りはすべて自分優先" onPress={() => onBulkSelect('self')} />
          <Button title="残りはすべて最新編集優先" onPress={() => onBulkSelect('latest')} />
          <Button title="キャンセル" onPress={onClose} color="#888" />
        </View>
      </View>
    </Modal>
  );
}

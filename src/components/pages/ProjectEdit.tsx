import React, { useCallback, useContext, useState } from 'react';
import { View, StyleSheet, FlatList, Text, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR, PROJECTEDIT_BTN } from '../../constants/AppConstants';
import HeaderRightButton from '../molecules/HeaderRightButton';
import { ProjectEditButtons } from '../organisms/ProjectEditButtons';
import { ProjectEditMembers } from '../organisms/ProjectEditMembers';
import { EditString } from '../molecules/EditString';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { ProjectEditContext } from '../../contexts/ProjectEdit';
import { ProjectType } from '../../types';

type MemberType = ProjectType['members'][number];

// 各要素の高さ定数
const HEADER_HEIGHT = 56;
const EDIT_STRING_HEIGHT = 70;
const BUTTONS_HEIGHT = 80;

export default function ProjectEditScreen() {
  const {
    isNew,
    isProjectOpen,
    project,
    isEdited,
    isOwner,
    isOwnerAdmin,
    isLoading,
    userUid,
    changeText,
    changeMemberText,
    changeAdmin,
    pressAddMembers,
    pressDeleteMember,
    pressReshareMemberKey,
    pressSaveProject,
    pressOpenProject,
    pressExportProject,
    pressDeleteProject,
    pressSettingProject,
    pressCloudDataManagement,
    gotoBack,
  } = useContext(ProjectEditContext);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [emails, setEmails] = useState('');

  // Web用: メンバーリストの最大高さを計算
  const editStringCount = isOwner || isNew ? 3 : 2;
  const memberListMaxHeight =
    windowHeight -
    (HEADER_HEIGHT + insets.top) -
    EDIT_STRING_HEIGHT * editStringCount -
    BUTTONS_HEIGHT -
    insets.bottom;

  const headerRightButton = () => (
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
  );

  // DEK方式のプロジェクトのみ、暗号化キーの再共有ボタン列を表示する。
  // 管理者は任意のメンバーへ、一般メンバーはオーナー宛てのみ再共有できる
  // （オーナーが鍵をリセットし管理者が他にいない場合の復旧用）。全行同値で判定して列ズレを防ぐ。
  const showReshareKey = project.cryptoScheme === 'dek' && !isNew;

  const renderMemberItem = useCallback(
    ({ item, index }: { item: MemberType; index: number }) => (
      <ProjectEditMembers
        key={index}
        name={item.role === 'OWNER' ? t('common.owner') : t('common.member')}
        value={item.email}
        verified={item.verified}
        role={item.role}
        editable={(isOwner && !isProjectOpen && index !== 0) || (isNew && index !== 0)}
        visibleMinus={item.role !== 'OWNER' && !isProjectOpen && (isOwner || isNew)}
        visibleReshareKey={showReshareKey}
        enableReshareKey={
          item.verified === 'OK' && !!item.uid && item.uid !== userUid && (isOwnerAdmin || item.role === 'OWNER')
        }
        onCheckAdmin={(checked) => changeAdmin(checked, index)}
        onChangeText={(value) => changeMemberText(value, index)}
        pressDeleteMember={(isOwner && !isProjectOpen) || isNew ? () => pressDeleteMember(index) : () => null}
        pressReshareMemberKey={() => pressReshareMemberKey(index)}
      />
    ),
    [
      changeAdmin,
      changeMemberText,
      isNew,
      isOwner,
      isOwnerAdmin,
      isProjectOpen,
      pressDeleteMember,
      pressReshareMemberKey,
      showReshareKey,
      userUid,
    ]
  );

  return (
    <>
      {/* Custom Header */}
      <View style={[styles.header, { height: HEADER_HEIGHT + insets.top, paddingTop: insets.top }]}>
        <TouchableOpacity style={{ padding: 5 }} onPress={gotoBack}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLOR.BLACK} />
        </TouchableOpacity>
        <Text style={{ fontSize: 16 }}>{t('ProjectEdit.navigation.title')}</Text>
        {headerRightButton()}
      </View>
      <View style={styles.container}>
        {/* 固定部分: プロジェクト名と概要 */}
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

        {(isOwnerAdmin || isNew) && (
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

        {/* メンバーリスト（スクロール可能）。一般メンバーにも読み取り専用で表示する
            （DEK方式でオーナーへ暗号化キーを再共有できるようにするため） */}
        <View style={styles.memberTableContainer}>
          <FlatList
            data={project.members}
            renderItem={renderMemberItem}
            keyExtractor={(_, index) => index.toString()}
            style={Platform.OS === 'web' ? { maxHeight: memberListMaxHeight } : undefined}
          />
        </View>

        <Loading visible={isLoading} text="" />
        <ProjectEditButtons
          disabled={isEdited}
          isNew={isNew}
          isOwnerAdmin={isOwnerAdmin}
          onPressOpenProject={() => pressOpenProject(false)}
          onPressDeleteProject={pressDeleteProject}
          onPressExportProject={pressExportProject}
          onPressSettingProject={pressSettingProject}
          onPressCloudDataManagement={pressCloudDataManagement}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLOR.MAIN,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLOR.MAIN,
    paddingHorizontal: 10,
  },
  memberTableContainer: {
    flex: 1,
  },
});

import React, { useCallback, useContext, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { ProjectsButtons } from '../organisms/ProjectsButtons';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { Button } from '../atoms';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { ProjectsContext } from '../../contexts/Projects';
import { ProjectsModalEncryptPassword } from '../organisms/ProjectsModalEncryptPassword';

export default function Projects() {
  const {
    projects,
    user,
    isLoading,
    isEncryptPasswordModalOpen,
    pressEncryptPasswordOK,
    pressEncryptPasswordCancel,
    onReloadProjects,
    pressAddProject,
    gotoProject,
    gotoBack,
  } = useContext(ProjectsContext);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const headerLeftButton = useCallback(
    (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      //@ts-ignore
      <HeaderBackButton {...props} labelVisible={false} onPress={gotoBack} />
    ),
    [gotoBack]
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
        <Text style={{ fontSize: 16 }}>{t('Projects.navigation.title')}</Text>
        <View style={{ width: 40 }} />
      </View>
    ),
    [headerLeftButton, insets.top]
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }} style={{ marginBottom: insets.bottom }}>
        <View style={{ flexDirection: 'column', flex: 1, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', height: 45 }}>
            <View style={[styles.th, { flex: 3, width: 180 }]}>
              <Text>{`${t('common.projectName')}`}</Text>
            </View>
            <View style={[styles.th, { flex: 2, width: 120 }]}>
              <Text>{`${t('common.overview')}`}</Text>
            </View>
            <View style={[styles.th, { flex: 2, width: 120 }]}>
              <Text>{`${t('common.usage')}`}</Text>
            </View>
            <View style={[styles.th, { flex: 2, width: 120 }]}>
              <Text>{`${t('common.license')}`}</Text>
            </View>
            <View style={[styles.th, { flex: 2, width: 100 }]}>
              <Text>{`${t('common.owner')}`}</Text>
            </View>
            <View style={[styles.th, { flex: 2, width: 120 }]}>
              <Text>{`${t('common.updatedAt')}`}</Text>
            </View>
          </View>
          {isLoading ? (
            <Loading visible={isLoading} text="" />
          ) : (
            <FlatList
              initialNumToRender={projects.length}
              data={projects}
              extraData={projects}
              renderItem={({ item, index }) => (
                <Pressable
                  key={index}
                  style={{
                    flex: 1,
                    height: 45,
                    flexDirection: 'row',
                  }}
                  onPress={() => gotoProject(index)}
                >
                  <View style={[styles.td, { flex: 3, width: 180 }]}>
                    <Text
                      adjustsFontSizeToFit={true}
                      numberOfLines={2}
                      onPress={() => gotoProject(index)}
                      testID={`project-${index}`}
                    >
                      {item.name}
                    </Text>
                  </View>
                  <View style={[styles.td, { flex: 2, width: 120 }]}>
                    <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                      {item.abstract}
                    </Text>
                  </View>
                  <View style={[styles.td, { flex: 2, width: 120, alignItems: 'flex-end' }]}>
                    <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                      {`${item.storage !== undefined ? (item.storage.count / (1024 * 1024 * 1024)).toFixed(2) : 0}GB`}
                    </Text>
                  </View>
                  <View style={[styles.td, { flex: 2, width: 120, alignItems: 'center' }]}>
                    <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                      {item.license ?? 'Free'}
                    </Text>
                  </View>
                  <View style={[styles.td, { flex: 2, width: 100, alignItems: 'center' }]}>
                    {item.ownerUid === user.uid && (
                      <Button
                        name={'star'}
                        onPress={() => null}
                        color={COLOR.GRAY4}
                        style={{ backgroundColor: COLOR.MAIN }}
                      />
                    )}
                  </View>
                  <View style={[styles.td, { flex: 2, width: 120, alignItems: 'center' }]}>
                    <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                      {item.encryptedAt ? new Date(item.encryptedAt).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      }) : '-'}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      </ScrollView>

      <ProjectsButtons createProject={pressAddProject} reloadProjects={onReloadProjects} />
      <ProjectsModalEncryptPassword
        visible={isEncryptPasswordModalOpen}
        pressOK={pressEncryptPasswordOK}
        pressCancel={pressEncryptPasswordCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  td: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    //flex: 1,
    //flexDirection: 'row',
    height: 45,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 0,
    //borderRightWidth: 1,
  },
  th: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderColor: COLOR.GRAY2,
    borderRightWidth: 1,
    //flex: 1,
    // flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
});

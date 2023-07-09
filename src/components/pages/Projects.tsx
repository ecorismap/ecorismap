import React, { useCallback, useContext, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { ProjectsButtons } from '../organisms/ProjectsButtons';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { RectButton2 } from '../atoms';
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

  const headerLeftButton = useCallback(
    (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props} onPress={gotoBack} />,
    [gotoBack]
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props),
      headerBackTitle: 'Back',
    });
  }, [headerLeftButton, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
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
          </View>
          {isLoading && <Loading visible={isLoading} text="" />}
          <FlatList
            data={projects}
            extraData={projects}
            renderItem={({ item, index }) => (
              <TouchableOpacity
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
                <View style={[styles.td, { flex: 2, width: 120 }]}>
                  <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                    {`${item.storage !== undefined ? (item.storage.count / (1024 * 1024 * 1024)).toFixed(2) : 0}GB`}
                  </Text>
                </View>
                <View style={[styles.td, { flex: 2, width: 120 }]}>
                  <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                    {item.license ?? 'Free'}
                  </Text>
                </View>
                <View style={[styles.td, { flex: 2, width: 100 }]}>
                  {item.ownerUid === user.uid && <RectButton2 name={'star'} onPress={() => null} />}
                </View>
              </TouchableOpacity>
            )}
          />
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
    justifyContent: 'flex-end',
  },
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    //flex: 1,
    //flexDirection: 'row',
    height: 45,
    justifyContent: 'center',
    paddingHorizontal: 10,
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

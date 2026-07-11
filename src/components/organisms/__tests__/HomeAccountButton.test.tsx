import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HomeAccountButton } from '../HomeAccountButton';
import { AppStateContext, AppStateContextType } from '../../../contexts/AppState';
import { ProjectContext, ProjectContextType } from '../../../contexts/Project';
import { UserType } from '../../../types';

// @expo/vector-iconsのモック
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'View',
}));

const noUser: UserType = { uid: undefined, email: null, displayName: null, photoURL: null };
const firebaseUser: UserType = { uid: 'uid1', email: 'taro@ecoris.co.jp', displayName: 'Taro', photoURL: null };

const createProjectValue = (googleAccountEmail: string | undefined): ProjectContextType =>
  ({
    projectName: undefined,
    isSynced: false,
    isShowingProjectButtons: false,
    isSettingProject: false,
    pressProjectLabel: jest.fn(),
    pressJumpProject: jest.fn(),
    pressDownloadData: jest.fn(),
    pressCloseProject: jest.fn(),
    pressUploadData: jest.fn(),
    pressSaveProjectSetting: jest.fn(),
    pressDiscardProjectSetting: jest.fn(),
    gotoProjects: jest.fn(),
    gotoAccount: jest.fn(),
    gotoLogin: jest.fn(),
    pressLogout: jest.fn(),
    googleAccountEmail,
    pressDisconnectDrive: jest.fn(),
  } as ProjectContextType);

const renderButton = async (user: UserType, projectValue: ProjectContextType) =>
  await render(
    <AppStateContext.Provider value={{ user } as AppStateContextType}>
      <ProjectContext.Provider value={projectValue}>
        <HomeAccountButton />
      </ProjectContext.Provider>
    </AppStateContext.Provider>
  );

describe('HomeAccountButton', () => {
  it('両方未ログイン: メニューを出さず単独のアカウントボタンのみ表示する', async () => {
    const projectValue = createProjectValue(undefined);
    const { queryByText } = await renderButton(noUser, projectValue);
    expect(queryByText('@')).toBeNull();
    expect(queryByText('Home.label.drive')).toBeNull();
    expect(queryByText('Home.label.projects')).toBeNull();
    expect(queryByText('Home.label.logout')).toBeNull();
  });

  it('Drive接続のみ: Googleメールのイニシャルを表示し、メニューはLOGOUT（切断）のみ', async () => {
    const projectValue = createProjectValue('mizutani@gmail.com');
    const { getByText, queryByText } = await renderButton(noUser, projectValue);
    // Googleメール由来のイニシャル
    const icon = getByText('M');
    // メニュー展開
    await fireEvent.press(icon);
    expect(getByText('Home.label.logout')).toBeTruthy();
    expect(queryByText('Home.label.projects')).toBeNull();
    expect(queryByText('Home.label.setting')).toBeNull();
    // LOGOUT = Drive切断
    await fireEvent.press(getByText('Home.label.logout'));
    expect(projectValue.pressDisconnectDrive).toHaveBeenCalled();
    expect(projectValue.pressLogout).not.toHaveBeenCalled();
  });

  it('Firebaseログインのみ: PROJECTS/SETTING/LOGOUTを表示しDRIVEは出さない', async () => {
    const projectValue = createProjectValue(undefined);
    const { getByText, queryByText } = await renderButton(firebaseUser, projectValue);
    const icon = getByText('T');
    await fireEvent.press(icon);
    expect(getByText('Home.label.projects')).toBeTruthy();
    expect(getByText('Home.label.setting')).toBeTruthy();
    expect(getByText('Home.label.logout')).toBeTruthy();
    // 組織ユーザーのDrive導線はSettings側に統一されているためDRIVEは非表示
    expect(queryByText('Home.label.drive')).toBeNull();
  });

  it('両方ログイン: Firebaseを優先表示し、LOGOUTはFirebaseログアウトのみ', async () => {
    const projectValue = createProjectValue('mizutani@gmail.com');
    const { getByText, queryByText } = await renderButton(firebaseUser, projectValue);
    // Firebase優先のイニシャル（Googleメール'M'ではなくdisplayName'T'）
    const icon = getByText('T');
    expect(queryByText('M')).toBeNull();
    await fireEvent.press(icon);
    // Firebaseログイン中はDrive接続済みでもDRIVEボタンは出さない（Settings側に統一）
    expect(queryByText('Home.label.drive')).toBeNull();
    await fireEvent.press(getByText('Home.label.logout'));
    expect(projectValue.pressLogout).toHaveBeenCalled();
    expect(projectValue.pressDisconnectDrive).not.toHaveBeenCalled();
  });
});

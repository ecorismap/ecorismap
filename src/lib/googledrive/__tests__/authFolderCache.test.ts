// アカウント監査 A-L11: 接続解除を経ずに別アカウントで接続し直すと、前のアカウントのフォルダIDを使い続けていた
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { signInGoogleDrive } from '../auth';
import { getCachedAppFolderId, setCachedAppFolderId } from '../appFolderCache';
import { DRIVE_FILE_SCOPE } from '../types';

jest.mock('../../../constants/APIKeys', () => ({
  googleDriveOAuth: { webClientId: 'web-client', iosClientId: 'ios-client' },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
    addScopes: jest.fn(),
    signOut: jest.fn().mockResolvedValue(null),
    getCurrentUser: jest.fn().mockReturnValue(null),
  },
}));

const mocked = GoogleSignin as jest.Mocked<typeof GoogleSignin>;

const success = (email: string) => ({
  type: 'success' as const,
  data: {
    user: { id: '1', name: null, email, photo: null, familyName: null, givenName: null },
    scopes: [DRIVE_FILE_SCOPE],
    idToken: null,
    serverAuthCode: null,
  },
});

describe('signInGoogleDrive とフォルダIDのキャッシュ', () => {
  beforeEach(() => jest.clearAllMocks());

  test('サインインに成功したらフォルダIDのキャッシュを捨てる', async () => {
    setCachedAppFolderId('folder-of-previous-account');
    mocked.signIn.mockResolvedValue(success('b@example.com'));
    const result = await signInGoogleDrive();
    expect(result.isOK).toBe(true);
    expect(getCachedAppFolderId()).toBeUndefined();
  });

  test('キャンセルしたときはキャッシュを残す（接続は前のまま）', async () => {
    setCachedAppFolderId('folder-of-current-account');
    mocked.signIn.mockResolvedValue({ type: 'cancelled', data: null });
    await signInGoogleDrive();
    expect(getCachedAppFolderId()).toBe('folder-of-current-account');
  });
});

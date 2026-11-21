import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { signInGoogleDrive } from '../auth';
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

const success = (scopes: string[]) => ({
  type: 'success' as const,
  data: {
    user: { id: '1', name: null, email: 'a@example.com', photo: null, familyName: null, givenName: null },
    scopes,
    idToken: null,
    serverAuthCode: null,
  },
});

describe('signInGoogleDrive scope check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('drive.fileが付いていればaddScopesを呼ばずに成功する', async () => {
    mocked.signIn.mockResolvedValue(success([DRIVE_FILE_SCOPE]));
    const result = await signInGoogleDrive();
    expect(result).toEqual({ isOK: true, message: '', email: 'a@example.com' });
    expect(mocked.addScopes).not.toHaveBeenCalled();
  });

  it('drive.fileが無ければaddScopesで追加し、付けば成功する', async () => {
    mocked.signIn.mockResolvedValue(success(['email']));
    mocked.addScopes.mockResolvedValue(success(['email', DRIVE_FILE_SCOPE]));
    const result = await signInGoogleDrive();
    expect(mocked.addScopes).toHaveBeenCalledWith({ scopes: [DRIVE_FILE_SCOPE] });
    expect(result.isOK).toBe(true);
  });

  it('addScopes後も付かなければscope-deniedを返しサインアウトする', async () => {
    mocked.signIn.mockResolvedValue(success(['email']));
    mocked.addScopes.mockResolvedValue({ type: 'cancelled', data: null });
    const result = await signInGoogleDrive();
    expect(result).toEqual({ isOK: false, message: 'scope-denied' });
    expect(mocked.signOut).toHaveBeenCalled();
  });

  it('AndroidでaddScopesがrejectしても（追加同意の拒否）scope-deniedを返しサインアウトする', async () => {
    mocked.signIn.mockResolvedValue(success(['email']));
    mocked.addScopes.mockRejectedValue(new Error('Failed to add scopes.'));
    const result = await signInGoogleDrive();
    expect(result).toEqual({ isOK: false, message: 'scope-denied' });
    expect(mocked.signOut).toHaveBeenCalled();
  });
});

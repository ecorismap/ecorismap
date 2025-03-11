import { isLoggedIn } from '../Account';
import { UserType } from '../../types';

describe('isLoggedIn', () => {
  it('returns true for logged in user', () => {
    const user: UserType = {
      uid: '123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    };
    expect(isLoggedIn(user)).toBe(true);
  });

  it('returns false for not logged in user', () => {
    const user: UserType = {
      uid: undefined,
      email: null,
      displayName: null,
      photoURL: null,
    };
    expect(isLoggedIn(user)).toBe(false);
  });

  it('returns false when uid is undefined', () => {
    const user: UserType = {
      uid: undefined,
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    };
    expect(isLoggedIn(user)).toBe(false);
  });

  it('returns false when email is null', () => {
    const user: UserType = {
      uid: '123',
      email: null,
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    };
    expect(isLoggedIn(user)).toBe(false);
  });

  it('returns false when displayName is null', () => {
    const user: UserType = {
      uid: '123',
      email: 'test@example.com',
      displayName: null,
      photoURL: 'https://example.com/photo.jpg',
    };
    expect(isLoggedIn(user)).toBe(false);
  });
});

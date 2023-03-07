import { LoginUserType, UserType } from '../types';

export const hasLoggedIn = (checkedUser: UserType): checkedUser is LoginUserType => {
  return checkedUser.uid !== undefined && checkedUser.email !== null && checkedUser.displayName !== null;
};

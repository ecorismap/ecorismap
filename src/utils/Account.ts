import { LogginUserType, UserType } from '../types';

export const hasLoggedIn = (checkedUser: UserType): checkedUser is LogginUserType => {
  return checkedUser.uid !== undefined && checkedUser.email !== null && checkedUser.displayName !== null;
};

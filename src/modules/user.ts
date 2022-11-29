import produce, { enableES5 } from 'immer';
enableES5();
import { UserType } from '../types';

export function createUserInitialState(): UserType {
  return { uid: undefined, email: '', displayName: '', photoURL: '' };
}

export const SET = 'user/set' as const;

export const setUserAction = (payload: UserType) => ({
  type: SET,
  value: payload,
});

export type Action = Readonly<ReturnType<typeof setUserAction>>;

const reducer = produce((draft, action: Action) => {
  switch (action.type) {
    case SET: {
      return action.value;
    }
    default:
      return draft;
  }
}, createUserInitialState());
export default reducer;

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UserType } from '../types';

export const userInitialState: UserType = {
  uid: undefined,
  email: '',
  displayName: '',
  photoURL: '',
};

const reducers = {
  //@ts-ignore
  setUserAction: (state, action: PayloadAction<UserType>) => {
    return action.payload;
  },
};

const userSlice = createSlice({
  name: 'user',
  initialState: userInitialState,
  reducers,
});

export const { setUserAction } = userSlice.actions;
export default userSlice.reducer;

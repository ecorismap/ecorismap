import reducer, { setUserAction } from '../user';
describe('modules/user', () => {
  test('should set the user to state', () => {
    const state = { uid: undefined, email: '', displayName: '', photoURL: '' };
    const user = {
      uid: '0',
      email: 'mizutani.takayuki@gmail.com',
      displayName: 'Takayuki Mizutani',
      photoURL: 'https://www.dummy.com/test.jpg',
    };
    const action = setUserAction(user);
    expect(reducer(state, action)).toEqual(user);
  });
});

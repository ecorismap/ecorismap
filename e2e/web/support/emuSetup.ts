import { createUser, resetEmulators, USERS } from './emu';

/** 全テストの前に1回: エミュレータを空にして、テスト用のアカウントを作る */
export default async function globalSetup() {
  try {
    await resetEmulators();
  } catch (e) {
    throw new Error(
      `Firebaseエミュレータにつながりません。yarn e2e:web:emu で流してください（エミュレータの起動から行います）。\n${String(e)}`
    );
  }
  for (const user of Object.values(USERS)) await createUser(user);
}

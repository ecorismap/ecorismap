/**
 * 認証セッションが外から切れたこと（別の場所でのパスワード変更・アカウント無効化・トークン失効）を見分ける（A-L4）。
 *
 * ネイティブ SDK はセッションが切れると currentUser を null にするだけで、アプリの Redux の user は永続化されて
 * ログイン中の表示のまま残る。auth の状態変化を受けて、「ログインしていた uid が、アプリ自身のサインアウトなしに
 * null になった」ときだけをセッション切れとする。起動時に最初から null のとき（ログアウト後にバックアップを
 * 復元した状態など）は、切れた瞬間を見ていないので扱わない。
 */
export type AuthSessionTracker = {
  /** auth の状態変化を渡す。サインイン中なら uid、サインアウトなら null */
  handleAuthUser: (uid: string | null) => void;
  /** アプリ自身がサインアウトする直前に呼ぶ。続く null をセッション切れとみなさない */
  markIntentionalSignOut: () => void;
  /** セッションが切れた uid（切れていなければ undefined） */
  getLostUid: () => string | undefined;
  /** 切れた記録を捨てる（ログアウトして Redux の user も消えた後など） */
  clearLost: () => void;
  /** 切れた1回につき最初の呼び出しだけ true を返す。ログインし直す案内を何度も出さないため */
  consumePrompt: () => boolean;
  subscribe: (listener: (uid: string) => void) => () => void;
};

export const createAuthSessionTracker = (): AuthSessionTracker => {
  let signedInUid: string | undefined;
  let lostUid: string | undefined;
  let prompted = false;
  let intentionalSignOut = false;
  const listeners = new Set<(uid: string) => void>();

  return {
    handleAuthUser: (uid) => {
      if (uid !== null) {
        signedInUid = uid;
        // 切れた記録を消すのは同じ人が入り直したときだけ。別の人のサインインはログインの取りやめ（A-M1 の確認で
        // キャンセル）や未確認アカウントで直後にサインアウトされうるので、Redux の user が差し替わるまで残す。
        // 消すと、鍵を消す LOGOUT へ誘導する従来の文言に戻ってしまう（差し替わった後は useAuthSessionLost が消す）
        if (uid === lostUid) {
          lostUid = undefined;
          prompted = false;
        }
        intentionalSignOut = false;
        return;
      }
      const previous = signedInUid;
      signedInUid = undefined;
      if (intentionalSignOut) {
        intentionalSignOut = false;
        return;
      }
      if (previous === undefined) return;
      lostUid = previous;
      prompted = false;
      listeners.forEach((listener) => listener(previous));
    },
    markIntentionalSignOut: () => {
      // サインインしていないときのサインアウトは状態変化を起こさない。印を残すと次の本当のセッション切れを見逃す
      if (signedInUid !== undefined) intentionalSignOut = true;
    },
    getLostUid: () => lostUid,
    clearLost: () => {
      lostUid = undefined;
      prompted = false;
    },
    consumePrompt: () => {
      if (lostUid === undefined || prompted) return false;
      prompted = true;
      return true;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

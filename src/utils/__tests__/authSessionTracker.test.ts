import { createAuthSessionTracker } from '../authSessionTracker';

// A-L4: 外からのセッション切れだけを見分ける
describe('createAuthSessionTracker', () => {
  it('サインイン中の uid が、アプリのサインアウトなしに null になったらセッション切れとして知らせる', () => {
    const tracker = createAuthSessionTracker();
    const listener = jest.fn();
    tracker.subscribe(listener);
    tracker.handleAuthUser('a');
    tracker.handleAuthUser(null);
    expect(tracker.getLostUid()).toBe('a');
    expect(listener).toHaveBeenCalledWith('a');
  });

  it('アプリ自身のサインアウトはセッション切れとみなさない', () => {
    const tracker = createAuthSessionTracker();
    tracker.handleAuthUser('a');
    tracker.markIntentionalSignOut();
    tracker.handleAuthUser(null);
    expect(tracker.getLostUid()).toBeUndefined();
  });

  it('サインインしていないときのサインアウトの印は残さない（次の本当のセッション切れを見逃さない）', () => {
    const tracker = createAuthSessionTracker();
    tracker.markIntentionalSignOut();
    tracker.handleAuthUser('a');
    tracker.handleAuthUser(null);
    expect(tracker.getLostUid()).toBe('a');
  });

  it('起動時に最初から null（ログアウト後の復元など）はセッション切れとしない', () => {
    const tracker = createAuthSessionTracker();
    tracker.handleAuthUser(null);
    expect(tracker.getLostUid()).toBeUndefined();
  });

  it('ログインし直すと切れた記録は消える', () => {
    const tracker = createAuthSessionTracker();
    tracker.handleAuthUser('a');
    tracker.handleAuthUser(null);
    tracker.handleAuthUser('a');
    expect(tracker.getLostUid()).toBeUndefined();
  });

  it('別の人がサインインしてすぐサインアウトした（ログインの取りやめ）ときは、切れた記録を残す', () => {
    const tracker = createAuthSessionTracker();
    tracker.handleAuthUser('a');
    tracker.handleAuthUser(null);
    expect(tracker.consumePrompt()).toBe(true);
    tracker.handleAuthUser('b');
    expect(tracker.getLostUid()).toBe('a');
    tracker.markIntentionalSignOut();
    tracker.handleAuthUser(null);
    expect(tracker.getLostUid()).toBe('a');
    // 案内済みの印も残す（「後で」の後はプロジェクト一覧の手前で改めて尋ねる）
    expect(tracker.consumePrompt()).toBe(false);
  });

  it('別の人のセッションが外から切れたら、その人の切れた記録に置き換わる', () => {
    const tracker = createAuthSessionTracker();
    const listener = jest.fn();
    tracker.subscribe(listener);
    tracker.handleAuthUser('a');
    tracker.handleAuthUser(null);
    tracker.handleAuthUser('b');
    tracker.handleAuthUser(null);
    expect(tracker.getLostUid()).toBe('b');
    expect(listener).toHaveBeenLastCalledWith('b');
  });

  it('案内は切れた1回につき1度だけ', () => {
    const tracker = createAuthSessionTracker();
    expect(tracker.consumePrompt()).toBe(false);
    tracker.handleAuthUser('a');
    tracker.handleAuthUser(null);
    expect(tracker.consumePrompt()).toBe(true);
    expect(tracker.consumePrompt()).toBe(false);
    tracker.clearLost();
    expect(tracker.getLostUid()).toBeUndefined();
  });

  it('購読を外したら知らせない', () => {
    const tracker = createAuthSessionTracker();
    const listener = jest.fn();
    const unsubscribe = tracker.subscribe(listener);
    unsubscribe();
    tracker.handleAuthUser('a');
    tracker.handleAuthUser(null);
    expect(listener).not.toHaveBeenCalled();
  });
});

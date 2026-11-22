import { buildHomeDownloadMergeInput, getHomeDownloadFetchModes } from '../homeDownload';
import { DataType, LayerType, RecordType } from '../../types';

const rec = (id: string, userId: string): RecordType =>
  ({ id, userId, displayName: userId, visible: true, redraw: false, coords: undefined, field: {}, updatedAt: 1 }) as RecordType;
const bucket = (layerId: string, userId: string, ids: string[]): DataType => ({
  layerId,
  userId,
  data: ids.map((id) => rec(id, userId)),
});

const layers = [
  { id: 'pub', permission: 'PUBLIC' },
  { id: 'prv', permission: 'PRIVATE' },
  { id: 'com', permission: 'COMMON' },
] as LayerType[];

const build = (isAdmin: boolean, isOwnerAdmin: boolean) =>
  buildHomeDownloadMergeInput({
    projectId: 'p1',
    fetchedAt: 500,
    ownVersions: new Map([['pub_PUBLIC', 1]]),
    publicRes: { data: [bucket('pub', 'me', ['cloudPub']), bucket('pub', 'other', ['o'])] },
    privateRes: {
      data: [bucket('prv', 'me', ['cloudPrv']), ...(isAdmin ? [bucket('prv', 'other', ['op'])] : [])],
      undecryptableGroups: [{ layerId: 'prv', userId: 'x', permission: 'PRIVATE' }],
    },
    templateRes: { data: [bucket('pub', 'template', ['t'])] },
    localDataSet: [
      bucket('pub', 'me', ['localPub']),
      bucket('prv', 'me', ['localPrv']),
      bucket('com', 'me', ['localCom']),
      bucket('pub', 'other', ['staleOther']),
    ],
    layers,
    ownUserId: 'me',
    isAdmin,
    isOwnerAdmin,
  });

const ids = (data: DataType[]) => data.flatMap((d) => d.data.map((r) => `${d.userId}:${r.id}`));

describe('getHomeDownloadFetchModes', () => {
  it('PUBLIC は全員分、PRIVATE は管理者が全員分を取るときだけ全員分', () => {
    expect(getHomeDownloadFetchModes(false)).toEqual({ public: 'all', private: 'own' });
    expect(getHomeDownloadFetchModes(true)).toEqual({ public: 'all', private: 'all' });
  });
});

describe('buildHomeDownloadMergeInput', () => {
  it('自分の分は手元の版だけを渡し、クラウドの自分の分は ownCloud にだけ入れる（二重にしない）', () => {
    const input = build(false, false);
    expect(ids(input.publicData)).toEqual(['other:o', 'me:localPub']);
    expect(ids(input.privateData)).toEqual(['me:localPrv']);
    expect(ids(input.ownCloud.publicData)).toEqual(['me:cloudPub']);
    expect(ids(input.ownCloud.privateData)).toEqual(['me:cloudPrv']);
    expect(input.ownCloud).toMatchObject({ projectId: 'p1', fetchedAt: 500 });
    expect(input.ownCloud.versions.get('pub_PUBLIC')).toBe(1);
    expect(ids(input.templateData)).toEqual(['template:t']);
    expect(input.undecryptableGroups).toEqual([{ layerId: 'prv', userId: 'x', permission: 'PRIVATE' }]);
  });

  it('一般メンバーは PUBLIC の他人の分を取り直した範囲として片付ける', () => {
    expect(build(false, false).fetchedScope).toEqual({ permissions: ['PUBLIC'], template: true, pruneOthers: true });
  });

  it('管理者が全員分を取らなかったときは他人の分を消さない', () => {
    expect(build(false, true).fetchedScope).toEqual({ permissions: ['PUBLIC'], template: true, pruneOthers: false });
  });

  it('管理者が全員分を取ったときは、他人の PRIVATE も渡し、PRIVATE も範囲に含める', () => {
    const input = build(true, true);
    expect(ids(input.privateData)).toEqual(['other:op', 'me:localPrv']);
    expect(input.fetchedScope).toEqual({ permissions: ['PUBLIC', 'PRIVATE'], template: true });
  });
});

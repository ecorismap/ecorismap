import { isSafePathSegment, isUriInsideFolder } from '../safePath';

describe('isSafePathSegment', () => {
  it('アプリが採番するID・固定ID・通常の写真名は許可する', () => {
    for (const value of ['01HZY8Q7K3M2N4P5R6S7T8V9W0', 'track', 'memo', 'IMG_0001.JPG', '調査写真 (1).jpg', 'a.b']) {
      expect(isSafePathSegment(value)).toBe(true);
    }
  });

  it('パス区切り・親参照・URL区切り・制御文字を含む値は拒否する', () => {
    for (const value of ['', '.', '..', '../..', 'a/b', 'a\\b', '%2e%2e', 'x?y', 'x#y', 'x;y', 'a\u0000b', 'a\nb']) {
      expect(isSafePathSegment(value)).toBe(false);
    }
  });

  it('文字列以外は拒否する', () => {
    for (const value of [undefined, null, 1, {}, []]) {
      expect(isSafePathSegment(value)).toBe(false);
    }
  });
});

describe('isUriInsideFolder', () => {
  const folder = 'file:///var/mobile/Containers/Data/Application/ABC/Documents/projects';

  it('フォルダ配下のuriは許可する（file://の有無を問わない）', () => {
    expect(isUriInsideFolder(`${folder}/P1/L1/U1/photo.jpg`, folder)).toBe(true);
    expect(isUriInsideFolder('/var/mobile/Containers/Data/Application/ABC/Documents/projects/LOCAL/L1/OWNER/a.jpg', folder)).toBe(true);
    expect(isUriInsideFolder(`${folder}/P1/L1/U1/photo.jpg`, `${folder}/`)).toBe(true);
  });

  it('フォルダ自身・兄弟フォルダ・名前が前方一致するだけのフォルダは拒否する', () => {
    expect(isUriInsideFolder(folder, folder)).toBe(false);
    expect(isUriInsideFolder(`${folder}/`, folder)).toBe(false);
    expect(isUriInsideFolder('file:///var/mobile/Containers/Data/Application/ABC/Documents/SQLite/a.db', folder)).toBe(false);
    expect(isUriInsideFolder(`${folder}-evil/a.jpg`, folder)).toBe(false);
  });

  it('親参照（エンコード・二重エンコードを含む）や区切り文字で外へ出るuriは拒否する', () => {
    expect(isUriInsideFolder(`${folder}/../mmkv/state`, folder)).toBe(false);
    expect(isUriInsideFolder(`${folder}/P1/./a.jpg`, folder)).toBe(false);
    expect(isUriInsideFolder(`${folder}/%2e%2e/mmkv/state`, folder)).toBe(false);
    expect(isUriInsideFolder(`${folder}/%252e%252e/mmkv/state`, folder)).toBe(false);
    expect(isUriInsideFolder(`${folder}/a.jpg?x`, folder)).toBe(false);
    expect(isUriInsideFolder(`${folder}/a\\..\\b`, folder)).toBe(false);
  });

  it('古いコンテナのパス・他人の端末のパス・空や非文字列は拒否する', () => {
    expect(isUriInsideFolder('file:///var/mobile/Containers/Data/Application/OLD/Documents/projects/a.jpg', folder)).toBe(false);
    expect(isUriInsideFolder('file:///data/user/0/jp.co.ecoris.ecorismap/files/projects/a.jpg', folder)).toBe(false);
    expect(isUriInsideFolder('', folder)).toBe(false);
    expect(isUriInsideFolder(null, folder)).toBe(false);
    expect(isUriInsideFolder('file:///x/%E0%A4%A', folder)).toBe(false);
  });
});

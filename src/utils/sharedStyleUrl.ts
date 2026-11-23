/**
 * 共有スタイル（style://）の URL が、このプロジェクトのこの地図のスタイルの置き場所
 * （Storage の projects/{project}/STYLE/{tileMapId}）を指しているか。
 * 別のプロジェクトから写した地図などの URL を、このプロジェクトの共有スタイルとして使い回さないために見る。
 */
export const isProjectStyleUrl = (styleURL: string | undefined, projectId: string, tileMapId: string): boolean => {
  if (styleURL === undefined || !styleURL.startsWith('style://')) return false;
  const url = styleURL.slice('style://'.length);
  // ダウンロード URL は .../o/{エンコードしたパス}?alt=media&token=...
  const marker = url.indexOf('/o/');
  if (marker < 0) return false;
  const encodedPath = url.slice(marker + '/o/'.length).split(/[?#]/)[0];
  let path: string;
  try {
    path = decodeURIComponent(encodedPath);
  } catch (e) {
    return false;
  }
  return path === `projects/${projectId}/STYLE/${tileMapId}`;
};

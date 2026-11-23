import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { isSafePathSegment, isUriInsideFolder } from './safePath';

/**
 * アップロードしてよい写真の uri か（写真監査 P-M13・P-M12）。
 *
 * 他のメンバーの記録の写真 uri は、送り手の端末のパスがそのまま届く。管理者が他人の記録を引き継いだときや、
 * COMMON の統合で全員分を自分の名義で送るときに、その uri を自分の端末で読んで上げてしまうと、
 * - 正当な利用では、手元にないファイルなので毎回失敗し、警告が出続ける
 * - 悪用されると、uri に自分の端末の別の写真のパスを書かれ、そのファイルをこのプロジェクトへ上げさせられる
 * そこで、自分が撮った・取り込んだ写真の置き場所にあるものだけを上げる。
 * - ネイティブ: このプロジェクト・レイヤの自分の写真フォルダか、ログイン前（LOCAL）のこのレイヤの写真フォルダの配下
 * - Web: 写真は手元のメモリ（blob:）にしかないので、blob: のものだけ
 * 削除（Photo.ts の deleteLocalPhoto）と書き出し（useGeoFile）も同じく自分の写真フォルダの配下だけを扱う。
 *
 * LOCAL のフォルダと Web の blob: は、パスに uid を含まないので、パスだけでは自分のものか分からない。
 * - Android の documentDirectory はどの端末でも同じ文字列になるので、他のメンバーが ZIP などから取り込んだ写真
 *   （プロジェクト中でも LOCAL/<layerId>/OWNER に置く）の uri が、自分の端末のパスと見分けがつかない
 * - blob: も同じオリジンの文字列なので、他のメンバーのタブで作られた blob: と見分けがつかない
 * そこで、他人の名義の記録（userId が自分でもテンプレートでもないもの）と、他人から引き継いだ記録（takenOverFrom を
 * 持つ）では LOCAL を許さず、他人の名義の記録では blob: も許さない。引き継いだ記録に管理者が Web で足した写真は
 * 自分の blob: なので許す（読めない blob: は、上げる前の canReadPhotoForUpload で弾く）。
 * record を渡さないときは、これまでどおり自分の記録として扱う。
 */
export const isOwnUploadablePhotoUri = (
  uri: string | null | undefined,
  projectId: string,
  layerId: string,
  uid: string,
  options: {
    platform?: string;
    photoFolder?: string;
    record?: { userId?: string; takenOverFrom?: string[] };
  } = {}
): uri is string => {
  if (typeof uri !== 'string' || uri === '') return false;
  const platform = options.platform ?? Platform.OS;
  const recordUserId = options.record?.userId;
  const isOwnRecord = recordUserId === undefined || recordUserId === uid || recordUserId === 'template';
  const isTakenOver = (options.record?.takenOverFrom?.length ?? 0) > 0;
  if (platform === 'web') return isOwnRecord && uri.startsWith('blob:');
  // フォルダ名に使う id が `..` などだと、フォルダの外を自分のフォルダと取り違える
  if (!isSafePathSegment(projectId) || !isSafePathSegment(layerId) || !isSafePathSegment(uid)) return false;
  const photoFolder = options.photoFolder ?? PHOTO_FOLDER;
  return (
    isUriInsideFolder(uri, `${photoFolder}/${projectId}/${layerId}/${uid}`) ||
    (isOwnRecord && !isTakenOver && isUriInsideFolder(uri, `${photoFolder}/LOCAL/${layerId}`))
  );
};

/**
 * 上げる前に、原画がこの端末（Web はこのタブ）で読めるかを確かめる（写真監査 P-M12・P-M13）。
 * パスの判定を通っても、他のメンバーの端末のパスがたまたま同じ文字列だったり（Android の LOCAL）、
 * 再読み込みで無効になった blob: だったりする。読めないものは上げても必ず失敗し、送るたびに警告が出るので、
 * 試さずに失敗にも数えない（写真は未アップロードのまま残る）
 */
export const canReadPhotoForUpload = async (uri: string, platform: string = Platform.OS): Promise<boolean> => {
  if (platform === 'web') {
    try {
      const response = await fetch(uri);
      return response.ok;
    } catch (e) {
      return false;
    }
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch (e) {
    return false;
  }
};

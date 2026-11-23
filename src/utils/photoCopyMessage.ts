import { t } from '../i18n/config';

/**
 * 記録の写し（複製・テンプレートの写し）で、写せなかった写真と、元の写真を参照したままの写真を知らせる文
 * （写真監査 P-M8・P-M10）。知らせることがなければ空文字
 */
export const copiedPhotosMessage = ({
  droppedPhotoCount,
  sharedPhotoCount,
}: {
  droppedPhotoCount: number;
  sharedPhotoCount: number;
}): string =>
  [
    droppedPhotoCount > 0 ? t('DataEdit.alert.photosNotCopied', { count: droppedPhotoCount }) : '',
    sharedPhotoCount > 0 ? t('DataEdit.alert.photosStillShared', { count: sharedPhotoCount }) : '',
  ]
    .filter((m) => m !== '')
    .join('\n');

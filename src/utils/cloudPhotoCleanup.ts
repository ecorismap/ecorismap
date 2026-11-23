/**
 * クラウドデータ管理でデータを消すときに、Storage から消してよい写真を決める（写真監査 P-H2）。
 *
 * 写真は撮った人のフォルダ（projects/{p}/PHOTO/{layer}/{uid}/{photoId}）に入る。一方で
 * - 同じ人のデータでも permission ごとに別の doc になる（管理者のテンプレートと自分の PUBLIC など）
 * - 管理者が引き継いだ記録は、名義が管理者に替わっても写真は撮った人のフォルダを指したまま
 * なので、消す doc の持ち主のフォルダを丸ごと消すと、残す doc の写真まで消える。
 * 残す doc が参照している写真は消さず、それ以外（フォルダ内の写真と、消す doc が参照する写真）だけを消す。
 */

/** 写真のダウンロード URL から Storage のパス（projects/.../PHOTO/...）を取り出す。取れなければ undefined */
export const photoStoragePathFromUrl = (url: unknown): string | undefined => {
  if (typeof url !== 'string') return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    return undefined;
  }
  const match = decoded.match(/projects\/[^/?#]+\/PHOTO\/[^/?#]+\/[^/?#]+\/[^/?#]+/);
  return match?.[0];
};

/** 記録の属性値から、写真の Storage パスを集める（PHOTO 項目に限らず url を持つ値を見る） */
export const collectPhotoPaths = (records: { field: Record<string, unknown> }[]): Set<string> => {
  const paths = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value !== null && typeof value === 'object') {
      const url = (value as { url?: unknown }).url;
      const path = photoStoragePathFromUrl(url);
      if (path !== undefined) paths.add(path);
      Object.values(value as Record<string, unknown>).forEach((v) => {
        if (v !== null && typeof v === 'object') visit(v);
      });
    }
  };
  records.forEach((record) => Object.values(record.field ?? {}).forEach(visit));
  return paths;
};

/**
 * 消す写真のパス。
 * - folderPaths: 消す doc の持ち主の写真フォルダにある写真
 * - deletedRefs: 消す doc が参照している写真（引き継いだ記録の写真など、別の人のフォルダにあるもの）
 * - keptRefs: 残す doc が参照している写真。これは消さない
 */
export const selectPhotoPathsToDelete = (
  folderPaths: Iterable<string>,
  deletedRefs: Iterable<string>,
  keptRefs: Set<string>
): string[] => {
  const result = new Set<string>();
  for (const path of folderPaths) if (!keptRefs.has(path)) result.add(path);
  for (const path of deletedRefs) if (!keptRefs.has(path)) result.add(path);
  return Array.from(result);
};

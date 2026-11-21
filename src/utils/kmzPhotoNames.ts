import sanitize from 'sanitize-filename';

/**
 * KMZに同梱する写真のファイル名を、写真の並び順どおりに決める。
 * doc.kml内の参照（imgのsrc等）と同梱ファイル名は、この結果を両側で使って一致させる。
 * - ファイル名として不正な文字（: / ? 等）は除き、相対URLとして別の意味になる # % は _ に置き換える
 * - 同名（大文字小文字違いを含む。Windowsで展開すると衝突するため）は _2, _3… を付けて上書きし合わないようにする
 */
export const kmzPhotoEntryNames = (names: string[]): string[] => {
  const used = new Set<string>();
  return names.map((name, index) => {
    const cleaned = sanitize(name.normalize('NFC')).replace(/[#%]/g, '_');
    const base = cleaned === '' ? `photo_${index + 1}.jpg` : cleaned;
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    let candidate = base;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem}_${n}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
};

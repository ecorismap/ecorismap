/**
 * RFC 4180 に沿って CSV をレコード（行）×フィールドの配列に分解する。
 *
 * 行単位で split すると引用符内の改行（STRING_MULTI の複数行メモなど）で
 * レコードが分裂するため、引用符の状態を保ったまま 1 文字ずつ読む。
 * - 引用符内のカンマ・改行（LF/CRLF/CR）・二重引用符（""）を値として扱う
 * - 引用符外の CRLF / LF / CR をレコードの区切りとする
 * - 先頭の BOM は除く
 * - 値の trim はしない（呼び出し側の方針に任せる）
 * - フィールド途中の " は文字として扱う（引用の開始はフィールド先頭のみ）
 * 引用符が閉じていない場合、以降をすべて 1 つの値にすると黙ってデータが壊れるため例外にする。
 */
export const parseCsv = (text: string): string[][] => {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // 引用済みフィールドの閉じ " の後に来た " で再び引用を始めないための印（"" 単独の空値など）
  let fieldWasQuoted = false;
  // 末尾が改行で終わるとき、空のレコードを1件余分に作らないための印
  let rowHasContent = false;

  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    // 引用符はフィールドの先頭（呼び出し側が trim するので空白のみ先行は許す）でだけ開始とみなす。
    // 途中の " まで開始扱いにすると 5'10" のような値で引用状態が反転し、
    // 以降の行がまとめて1つの値に吸い込まれる（Excel・Python csv と同じ寛容な扱いにする）
    if (char === '"' && !fieldWasQuoted && field.trim() === '') {
      inQuotes = true;
      fieldWasQuoted = true;
      rowHasContent = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
      fieldWasQuoted = false;
      rowHasContent = true;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldWasQuoted = false;
      rowHasContent = false;
    } else {
      field += char;
      rowHasContent = true;
    }
  }

  if (inQuotes) {
    throw new Error('CSV: unterminated quoted field');
  }
  if (rowHasContent) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

/**
 * 処理中表示の文言を組み立てる。
 * 進捗が0のあいだ（PDFの変換中など進捗を取れない段階）は「0%」を出さない。
 * 0%のまま数十秒止まって見えると、処理が始まっていないと受け取られるため。
 */
export const formatLoadingText = (message: string, progress: string): string => {
  const value = Number(progress);
  if (progress === '' || !Number.isFinite(value) || value <= 0) return message;
  return `${message}\n${Math.round(value)}%`;
};

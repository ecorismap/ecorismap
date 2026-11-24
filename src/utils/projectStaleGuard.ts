/**
 * プロジェクト編集画面の内容が、クラウドの最新より古いか。
 * localEncryptedAt は一覧から開いたときのプロジェクトの encryptedAt（端末に保存した一覧では文字列になっていることがある）。
 * どちらかが無いときは比べられないので古いとはみなさない（照合前から保存できていた経路を止めない）
 */
export const isStaleProjectEdit = (
  localEncryptedAt: Date | string | undefined,
  latestEncryptedAt: Date | undefined
): boolean => {
  if (localEncryptedAt === undefined || latestEncryptedAt === undefined) return false;
  const local = new Date(localEncryptedAt).getTime();
  if (Number.isNaN(local)) return false;
  return latestEncryptedAt.getTime() > local;
};

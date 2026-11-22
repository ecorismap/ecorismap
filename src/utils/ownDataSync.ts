import { LayerType, RecordType } from '../types';

/**
 * 自分のデータのアップロード・取得で使う判定（同期監査 M10・L4）。
 */

/**
 * アップロードしようとしているレイヤのうち、クラウドの設定と権限（permission）が食い違うもの（M10）。
 * 権限が変わったあと古い設定のままアップロードすると、旧権限の doc が二重にでき、開き直すと新しい版が古い版に戻る。
 * クラウドの設定から消えたレイヤも含める（上げても定義の無い doc になる）。ただし track は旧プロジェクトの設定に
 * 無いことがある（取得時に補う）ので、無いことだけでは食い違いとみなさない
 */
export const findSettingsMismatchedLayers = (localLayers: LayerType[], cloudLayers: LayerType[]): LayerType[] =>
  localLayers.filter((layer) => {
    const cloudLayer = cloudLayers.find((l) => l.id === layer.id);
    if (cloudLayer === undefined) return layer.id !== 'track';
    return cloudLayer.permission !== layer.permission;
  });

/**
 * 手元の自分の記録と、クラウドの自分の記録を合わせる（L4: ホームの「データ取得」で別端末の自分の変更を取り込む）。
 * - 片方にしか無い記録はそのまま残す（手元にだけある＝未アップロードの記録は消さない）
 * - 両方にあって版（updatedAt と削除）が同じなら手元を採る
 * - 手元の方が新しければ手元を採る（未アップロードの変更）
 * - クラウドの方が新しければ、手元にも未アップロードの変更があるか判定できないので、既存の競合解決（resolve）で選ばせる。
 *   手元を選んだときは updatedAt をクラウドの版より後に進める。進めないと、次のアップロードの衝突判定で
 *   クラウドの版が「新しい変更」として再び確認が出て、マージ（最新優先）で選んだ手元の版が負けてしまう
 *
 * hasLocalOnly は、クラウドに無い手元の変更が残ったか（手元＝クラウドでないか）。false なら手元はクラウドと同じ。
 */
export const mergeOwnCloudRecords = async ({
  localRecords,
  cloudRecords,
  resolve,
  now,
}: {
  localRecords: RecordType[];
  cloudRecords: RecordType[];
  resolve: (candidates: RecordType[], id: string) => Promise<RecordType>;
  now: number;
}): Promise<{ records: RecordType[]; hasLocalOnly: boolean }> => {
  const cloudById = new Map(cloudRecords.map((r) => [r.id, r]));
  const localIds = new Set(localRecords.map((r) => r.id));
  const records: RecordType[] = [];
  let hasLocalOnly = false;

  for (const local of localRecords) {
    const cloud = cloudById.get(local.id);
    if (cloud === undefined) {
      records.push(local);
      hasLocalOnly = true;
      continue;
    }
    const localAt = local.updatedAt ?? 0;
    const cloudAt = cloud.updatedAt ?? 0;
    if (localAt === cloudAt && (local.deleted === true) === (cloud.deleted === true)) {
      records.push(local);
      continue;
    }
    if (localAt > cloudAt) {
      records.push(local);
      hasLocalOnly = true;
      continue;
    }
    // 先に手元を渡す（一括解決の「自分優先」は、同じ名義の候補なら先頭＝手元を採る）
    const chosen = await resolve([local, cloud], local.id);
    if (chosen === cloud) {
      records.push(cloud);
    } else {
      records.push({ ...local, updatedAt: Math.max(now, cloudAt + 1) });
      hasLocalOnly = true;
    }
  }
  // クラウドにだけある記録（別端末で追加したもの）
  cloudRecords.forEach((cloud) => {
    if (!localIds.has(cloud.id)) records.push(cloud);
  });
  return { records, hasLocalOnly };
};

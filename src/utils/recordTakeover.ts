import { DataType, LayerType, PhotoType, RecordType } from '../types';

/**
 * 他のメンバー・テンプレートの記録の変更と削除（同期監査 M8・L1）。
 *
 * アップロードは自分の名義の doc だけを書き換えるので、他人の記録を手元で消したり直したりしても、その人の doc は
 * 変わらない。そのままだと、削除は次の取得で元に戻り、編集は同じ id が2人の名義に並んで取得のたびに競合になる。
 * そこで、変更・削除できるのは管理者だけにし、管理者の変更は「引き継ぎ」として自分の名義へ移す。
 * - 引き継いだ版には引き継ぎ元（takenOverFrom）を持たせる。削除なら墓標（deleted）として持つ
 * - 取得やマージで同じ id が引き継ぎ元の名義にもあれば、updatedAt を比べて新しくない方を打ち消す
 *   （引き継いだ版のほうが新しければ元の持ち主の版を捨てる。元の持ち主がその後さらに直していれば、そちらを採り、
 *   引き継いだ版を捨てる＝レコード単位の最新勝ち（L6 の方針）と同じ）
 * - 元の持ち主の端末も、取得で自分の名義から外れた記録を次のアップロードで送らない。クラウドに残る古い版も、
 *   打ち消されるものとして衝突の判定やマージに使わない
 */

/** 他人・テンプレートの記録を変更・削除できない理由 */
export type RecordModifyBlock = 'adminOnly' | 'privateLayer' | 'commonLayer';

export type RecordModifyAction = 'edit' | 'delete';

/**
 * 記録を変更・削除してよいか。してよければ undefined、だめなら理由を返す。
 * - プロジェクトを閉じているとき・設定モードのときは従来どおり（設定モードはテンプレート・共通データの編集の場で、
 *   保存の仕組みが別にある）
 * - 自分の記録と、ログイン前に作った記録（userId なし）は従来どおり
 * - テンプレートの記録の編集は、一般メンバーも従来どおり自分の記録として持ち替える（テンプレートは全員の版に負けるので
 *   競合しない）。テンプレートの削除は他人の記録と同じ扱い
 * - 共通データ（COMMON）は実行中に変えてもアップロードされないので、誰も変えられない（従来の lockProject と同じ）
 * - 一般メンバーは他人・テンプレートの記録を変えられない
 * - 非公開（PRIVATE）のレイヤでは、管理者の引き継いだ版がメンバーの端末に届かない（メンバーは他人の PRIVATE を
 *   読めない）ので、管理者も変えられない。テンプレートは設定モードで変える
 */
export const getRecordModifyBlock = ({
  layer,
  recordUserId,
  action,
  ownUserId,
  isOwnerAdmin,
  isRunningProject,
}: {
  layer: Pick<LayerType, 'permission'>;
  recordUserId: string | undefined;
  action: RecordModifyAction;
  ownUserId: string | undefined;
  isOwnerAdmin: boolean;
  isRunningProject: boolean;
}): RecordModifyBlock | undefined => {
  if (!isRunningProject || ownUserId === undefined) return undefined;
  if (recordUserId === undefined || recordUserId === ownUserId) return undefined;
  if (recordUserId === 'template' && action === 'edit') return undefined;
  if (layer.permission === 'COMMON') return 'commonLayer';
  if (!isOwnerAdmin) return 'adminOnly';
  if (layer.permission !== 'PUBLIC') return 'privateLayer';
  return undefined;
};

/** 変更できない理由の利用者向け文言の i18n キー */
export const recordModifyBlockMessageKey = (block: RecordModifyBlock): string => {
  switch (block) {
    case 'adminOnly':
      return 'hooks.message.recordModifyAdminOnly';
    case 'privateLayer':
      return 'hooks.message.recordModifyPrivateLayer';
    case 'commonLayer':
      return 'hooks.message.lockProject';
  }
};

/** 引き継ぎ元に userId を足す（重複は除き、順は保つ） */
export const addTakenOverFrom = (current: string[] | undefined, ...userIds: (string | undefined)[]): string[] => {
  const result = [...(current ?? [])];
  userIds.forEach((userId) => {
    if (userId !== undefined && !result.includes(userId)) result.push(userId);
  });
  return result;
};

/**
 * 引き継いだ版 s に、打ち消される元の版 r で既に上がっている写真の url/key を写す（写真監査 P-M12）。
 * 撮影者の端末で写真が上がらないうちに管理者が引き継ぐと、引き継いだ版の写真は url:null のまま、uri は撮影者の
 * 端末のパスになる。管理者の端末にはそのファイルが無いので上げられない。撮影者が後から上げても、写真のアップロードは
 * 記録の updatedAt を進めないので、引き継いだ版が勝って上がった写真が見えなくなる。そこで同じ写真（同じ id）について、
 * 引き継いだ版が url:null で元の版に url/key があれば、それを使う。uri は引き継いだ版のまま
 */
const inheritUploadedPhotos = <T extends RecordType>(s: T, originals: RecordType[]): T => {
  const uploaded = new Map<string, { url: string; key: string }>();
  originals.forEach((r) =>
    Object.values(r.field).forEach((value) => {
      if (!Array.isArray(value)) return;
      (value as unknown[]).forEach((item) => {
        const photo = item as Partial<PhotoType> | null;
        if (typeof photo !== 'object' || photo === null || typeof photo.id !== 'string') return;
        if (typeof photo.url === 'string' && photo.url !== '' && typeof photo.key === 'string' && photo.key !== '') {
          uploaded.set(photo.id, { url: photo.url, key: photo.key });
        }
      });
    })
  );
  if (uploaded.size === 0) return s;
  let changed = false;
  const field = { ...s.field };
  Object.entries(s.field).forEach(([name, value]) => {
    if (!Array.isArray(value)) return;
    let fieldChanged = false;
    const photos = (value as unknown[]).map((item) => {
      const photo = item as Partial<PhotoType> | null;
      if (typeof photo !== 'object' || photo === null || typeof photo.id !== 'string' || photo.url !== null) {
        return item;
      }
      const found = uploaded.get(photo.id);
      if (found === undefined) return item;
      fieldChanged = true;
      return { ...photo, url: found.url, key: found.key };
    });
    if (fieldChanged) {
      changed = true;
      field[name] = photos as PhotoType[];
    }
  });
  return changed ? { ...s, field } : s;
};

/**
 * 同じ id の候補から引き継ぎで打ち消される版を除き、残す版と、その元になった候補を組で返す。
 * 残す版は、打ち消した元の版の上がっている写真を受け継いだ写しのことがある（inheritUploadedPhotos）
 */
const resolveTakeoverCandidatesWithSource = <T extends RecordType>(candidates: T[]): { source: T; kept: T }[] => {
  const asIs = candidates.map((c) => ({ source: c, kept: c }));
  if (candidates.length < 2 || !candidates.some((c) => (c.takenOverFrom?.length ?? 0) > 0)) return asIs;
  const dropped = new Set<T>();
  // 引き継いだ版 → それが打ち消した元の版
  const overridden = new Map<T, T[]>();
  for (const s of candidates) {
    const from = s.takenOverFrom;
    if (from === undefined || from.length === 0) continue;
    for (const r of candidates) {
      if (r === s || r.userId === undefined || r.userId === s.userId || !from.includes(r.userId)) continue;
      if ((s.updatedAt ?? 0) >= (r.updatedAt ?? 0)) {
        dropped.add(r);
        overridden.set(s, [...(overridden.get(s) ?? []), r]);
      } else dropped.add(s);
    }
  }
  if (dropped.size === 0) return asIs;
  const rest = candidates.filter((c) => !dropped.has(c));
  if (rest.length === 0) return asIs;
  return rest.map((c) => {
    const originals = overridden.get(c);
    return { source: c, kept: originals === undefined ? c : inheritUploadedPhotos(c, originals) };
  });
};

/**
 * 同じ id の候補から、引き継ぎで打ち消される版を除く。
 * 引き継いだ版 S（takenOverFrom を持つ）と、その引き継ぎ元の名義の版 R が並んでいれば、updatedAt が新しい方を残す。
 * 同じなら引き継いだ版を残す（引き継ぐときに元の版より新しい時刻にしているので、同じになるのは元の版の写しのとき）。
 * 打ち消し合って何も残らない（互いに引き継ぎ元に挙げている等）ときは、判断せずにそのまま返す。
 * 引き継いだ版を残すときは、元の版で上がっている写真の url/key を受け継ぐ（写真監査 P-M12）
 */
export const resolveTakeoverCandidates = <T extends RecordType>(candidates: T[]): T[] =>
  resolveTakeoverCandidatesWithSource(candidates).map(({ kept }) => kept);

/** 管理者がテンプレートの記録を消した墓標か（引き継ぎ元に 'template' を持つ削除） */
export const isTemplateDeletionTombstone = (record: RecordType): boolean =>
  record.deleted === true && (record.takenOverFrom ?? []).includes('template');

/**
 * 同じ id の候補（resolveTakeoverCandidates の後）から、テンプレートの削除の墓標を競合の候補から外す。
 * テンプレートを編集したメンバーは、同じ id の記録を自分の記録として持つ（引き継ぎ元は付かない）。これはテンプレートとは
 * 別の、その人の記録で、テンプレートはもともと利用者の版に負ける。管理者がテンプレートを消した墓標とその人の記録を
 * 競合として並べると、取得のたびに確認が出続け、墓標を外す側を選ぶとクラウドのテンプレートが全員の画面に戻る。
 * そこで、利用者の版があるときは墓標を競合に入れず、利用者の版の横にそのまま残す（墓標はテンプレートを打ち消し続け、
 * 利用者の版も残る）。利用者の版が無いときは、墓標をそのまま候補に残す
 */
export const separateTemplateDeletionTombstones = <T extends RecordType>(
  candidates: T[]
): { candidates: T[]; tombstones: T[] } => {
  const tombstones = candidates.filter(isTemplateDeletionTombstone);
  if (tombstones.length === 0) return { candidates, tombstones: [] };
  const rest = candidates.filter((c) => !tombstones.includes(c));
  const userVersions = rest.filter((c) => c.userId !== 'template');
  if (userVersions.length === 0) return { candidates, tombstones: [] };
  // 同じ名義の版どうし（同じ人の端末とクラウドの版など）は、ふつうの競合として扱う（横に残すと同じ集合に同じ id が並ぶ）
  const tombstoneUsers = new Set(tombstones.map((s) => s.userId));
  if (userVersions.some((c) => tombstoneUsers.has(c.userId)) || tombstoneUsers.size < tombstones.length) {
    return { candidates, tombstones: [] };
  }
  return { candidates: rest, tombstones };
};

/**
 * 集合（target）の記録から、引き継ぎで打ち消されるものを除く。判定には target と context の両方の記録を使い、
 * 除くのは target の記録だけ（context は手元の他の名義など、比べるためだけの集合）。変わらない集合は同じ参照で返す
 */
export const applyTakeoversToDataSet = (
  target: DataType[],
  context: DataType[] = [],
  // true なら、残す引き継いだ版に、打ち消した元の版で上がっている写真の url/key を受け継がせる（写真監査 P-M12）。
  // 取得した版をそのまま手元に入れるときだけ使う。版の中身を比べて取り込むかを決める処理（COMMON の統合など）では、
  // 受け継いだ写しが手元の版と違うものに見えて二重に取り込まれるので使わない
  options: { inheritUploadedPhotos?: boolean } = {}
): DataType[] => {
  const all = [...target, ...context];
  if (!all.some((d) => d.data.some((r) => (r.takenOverFrom?.length ?? 0) > 0))) return target;
  const droppedByLayer = new Map<string, Set<RecordType>>();
  // 残す版のうち、元の版の上がっている写真を受け継いで差し替えるもの（写真監査 P-M12）
  const replaced = new Map<RecordType, RecordType>();
  const layerIds = new Set(target.map((d) => d.layerId));
  layerIds.forEach((layerId) => {
    const byId = new Map<string, RecordType[]>();
    all
      .filter((d) => d.layerId === layerId)
      .forEach((d) =>
        d.data.forEach((record) => {
          const list = byId.get(record.id);
          if (list === undefined) byId.set(record.id, [record]);
          else list.push(record);
        })
      );
    const dropped = new Set<RecordType>();
    byId.forEach((candidates) => {
      if (candidates.length < 2) return;
      const resolved = resolveTakeoverCandidatesWithSource(candidates);
      const rest = new Set(resolved.map(({ source }) => source));
      candidates.forEach((c) => {
        if (!rest.has(c)) dropped.add(c);
      });
      if (options.inheritUploadedPhotos === true) {
        resolved.forEach(({ source, kept }) => {
          if (kept !== source) replaced.set(source, kept);
        });
      }
    });
    droppedByLayer.set(layerId, dropped);
  });
  return target.map((d) => {
    const dropped = droppedByLayer.get(d.layerId) ?? new Set<RecordType>();
    if (!d.data.some((r) => dropped.has(r) || replaced.has(r))) return d;
    return { ...d, data: d.data.filter((r) => !dropped.has(r)).map((r) => replaced.get(r) ?? r) };
  });
};

/** 1つの名義の記録（records）から、context の記録との引き継ぎで打ち消されるものを除く */
export const dropRecordsResolvedAway = (
  layerId: string,
  userId: string | undefined,
  records: RecordType[],
  context: DataType[]
): RecordType[] => applyTakeoversToDataSet([{ layerId, userId, data: records }], context)[0].data;

import { BrushType, StampType } from '../types';

/**
 * 飛翔図の行動記号（ブラシ・スタンプ）と属性の対応表。
 *
 * 記号は実務の記法で決まっていて増やせないので、属性の方を記号に合わせる。
 * 行動ごとにフィールドを分け、選択肢はその行動の中身（どのとまりか、どの誇示か）にする。
 * 記号を置くとそのフィールドにチェックが入り、中身が分かれる行動は置いた直後に選んで上書きする。
 * 記号を見れば分かる飛翔の様子（ホバリング・旋回・旋上・急降下）はここに載せず、属性を持たない。
 *
 * フィールド名は飛翔図プリセットのもの。名前を変えたレイヤでは自動入力は効かない。
 */
export type HisyouBehaviorType = {
  //記号のキー（_stamp / _strokeStyle に入る値）
  symbol: StampType | BrushType;
  //その行動のフィールド名
  fieldName: string;
  //記号を置いた時点で入る値。中身が分かれない行動（旋回など）はこれだけ
  defaultValue: string;
  //置いた直後に中身を選んでもらうか（選ばなければdefaultValueのまま）
  hasDetail?: boolean;
};

export const HISYOU_BEHAVIORS: HisyouBehaviorType[] = [
  //誇示は単発（波状・羽打ちなど）と連続（連れ立ち・V字など）で記号が違うので、フィールドも分ける
  { symbol: 'DISPLAY1', fieldName: '誇示単発', defaultValue: '不明', hasDetail: true },
  { symbol: 'DISPLAY2', fieldName: '誇示連続', defaultValue: '不明', hasDetail: true },
  { symbol: 'KOUGEKI', fieldName: '排斥', defaultValue: '不明', hasDetail: true },
  { symbol: 'ESA', fieldName: '餌運搬', defaultValue: '不明', hasDetail: true },
  { symbol: 'TOMARI', fieldName: 'とまり', defaultValue: '不明', hasDetail: true },
  { symbol: 'KOUBI', fieldName: '交尾', defaultValue: '不明', hasDetail: true },
  { symbol: 'VOICE', fieldName: '声', defaultValue: '不明', hasDetail: true },
  { symbol: 'SUZAI', fieldName: '巣材運搬', defaultValue: '不明', hasDetail: true },
  { symbol: 'TANJI', fieldName: '探餌', defaultValue: 'あり' },
  { symbol: 'KARI', fieldName: '狩り', defaultValue: 'あり' },
  //ホバリング・旋回・旋上・急降下は飛翔の様子そのもので、記号を見れば分かるため属性は持たない
];

const behaviorMap = new Map(HISYOU_BEHAVIORS.map((behavior) => [behavior.symbol as string, behavior]));

//記号に対応する行動。飛翔図の記号でなければundefined
export const getHisyouBehavior = (symbol: string): HisyouBehaviorType | undefined => behaviorMap.get(symbol);

//描いたストロークのスタイルから記号のキーを取り出す（スタンプが無ければブラシ種別を見る）
export const getSymbolKey = (style: { stamp: string; strokeStyle: string }): string =>
  style.stamp !== '' ? style.stamp : style.strokeStyle;

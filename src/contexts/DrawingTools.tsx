import React from 'react';
import {
  ArrowStyleType,
  DrawToolType,
  FeatureButtonType,
  HandwritingSubToolType,
  LayerType,
  MapMemoToolGroupType,
  PenWidthType,
  RecordType,
  PointToolType,
  LineToolType,
  PolygonToolType,
} from '../types';
import { Position } from 'geojson';

// Drawing line data structure
export interface DrawLineData {
  id: string;
  coordinates: Position[];
  timestamp: number;
}

// Select line data structure
export interface SelectLineData {
  selectedIndex: number | null;
  coordinates: Position[];
}

// Drawing state interface
export interface DrawingState {
  isEditingDraw: boolean;
  isEditingObject: boolean;
  isSelectedDraw: boolean;
  isEditingLine: boolean;
  editingLineId: string | undefined;
}

// Current tools interface
export interface CurrentTools {
  featureButton: FeatureButtonType;
  currentDrawTool: DrawToolType;
  currentPointTool: PointToolType;
  currentLineTool: LineToolType;
  currentPolygonTool: PolygonToolType;
}

// Drag event interface
export interface DragEndEvent {
  nativeEvent: {
    coordinate: {
      latitude: number;
      longitude: number;
    };
  };
  lngLat?: {
    lng: number;
    lat: number;
  };
}

export interface DrawingToolsContextType {
  // Drawing states (grouped for better memoization)
  drawingState: DrawingState;

  // Current tools (grouped for better memoization)
  currentTools: CurrentTools;

  // Tool actions (stable references)
  selectFeatureButton: (value: FeatureButtonType) => void;
  selectDrawTool: (value: DrawToolType) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;

  // Drawing actions (stable references)
  onDragEndPoint: (e: DragEndEvent, layer: LayerType, feature: RecordType) => Promise<void>;
  pressUndoDraw: () => Promise<void>;
  pressRedoDraw: () => void;
  isUndoable: boolean;
  isRedoable: boolean;
  //undo/redoの統一ハンドラ（メモモードの通常時はメモ書き込み履歴、それ以外は作図編集の履歴）
  pressUndo: () => Promise<void>;
  pressRedo: () => void;
  isUndoAvailable: boolean;
  isRedoAvailable: boolean;
  pressSaveDraw: () => Promise<boolean>;
  pressDeleteDraw: () => Promise<void>;
  finishEditObject: () => boolean;
  resetDrawTools: () => void;

  // Editing layer chip (toolbar)
  editingLayerName: string | undefined;
  //編集レイヤ。用途・色分け・フィールドからツールパレットを組み立てる
  editingLayer: LayerType | undefined;
  //属性を選ぶパレット（植生図の区分、飛翔図の種名・雌雄・成幼）で、次に描くオブジェクトの値を決める。
  //複数の属性を選び終えてからまとめて渡す
  selectFieldValues: (values: { [fieldName: string]: string }) => void;
  //選択肢を新しく足す（現地で増えたときに、レイヤ設定へ戻らず追加できるようにする）
  addFieldValue: (fieldName: string, value: string, color: string) => void;
  //選択肢の名前・色を変える。名前を変えたときは、その値で保存済みのレコードも追従させる
  updateFieldValue: (fieldName: string, oldValue: string, newValue: string, color: string) => void;
  //選択肢を消す（保存済みのレコードの値は残す）
  deleteFieldValue: (fieldName: string, value: string) => void;
  pressEditingLayerButton: () => Promise<void>;

  //アクティブレイヤの色分けが「個別（_strokeColor参照）」か。trueなら色・太さボタンを常時表示する
  isIndividualStyleLayer: boolean;
  //単一オブジェクト選択中の太さ。太さパレットを開くときの初期値にする（プロパティパネル方式）
  selectedObjectWidthType?: PenWidthType;
  //単一オブジェクト選択中の矢印スタイル（スタイル設定モーダルの初期表示用）
  selectedObjectArrowStyle?: ArrowStyleType;
  //手書きの編集選択から分割ツールへ切り替える準備（選択オブジェクトを分割対象にする）
  switchSelectionToSplit: () => boolean;
  //手書きペンのサブツール（ペン/スタンプ/ブラシ）と設定モーダルの起動
  handwritingSubTool: HandwritingSubToolType;
  setHandwritingSubTool: React.Dispatch<React.SetStateAction<HandwritingSubToolType>>;
  openHandwritingSettingsTab: (tab: MapMemoToolGroupType) => void;

  // Backward compatibility (to be deprecated gradually)
  isEditingDraw: boolean;
  isEditingObject: boolean;
  isAreaSelected: boolean;
  isSelectedDraw: boolean;
  isEditingLine: boolean;
  editingLineId: string | undefined;
  featureButton: FeatureButtonType;
  currentDrawTool: DrawToolType;
  currentPointTool: PointToolType;
  currentLineTool: LineToolType;
  currentPolygonTool: PolygonToolType;
}

export const DrawingToolsContext = React.createContext<DrawingToolsContextType>({} as DrawingToolsContextType);

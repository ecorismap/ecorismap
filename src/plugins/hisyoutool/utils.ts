import { HisyouToolType } from './hisyoutool';

import { HISYOUTOOL } from './Constants';
import { LineToolType } from '../../types';

export function isHisyouTool(tool: LineToolType): tool is HisyouToolType {
  return Object.keys(HISYOUTOOL).includes(tool);
}

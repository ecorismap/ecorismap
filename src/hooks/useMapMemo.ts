import { Dispatch, SetStateAction, useState } from 'react';

export type UseMapMemoReturnType = {
  visibleMapMemo: boolean;
  setVisibleMapMemo: Dispatch<SetStateAction<boolean>>;
};

export const useMapMemo = (): UseMapMemoReturnType => {
  const [visibleMapMemo, setVisibleMapMemo] = useState(false);

  return { visibleMapMemo, setVisibleMapMemo } as const;
};

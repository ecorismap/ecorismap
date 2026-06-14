import { useCallback, useEffect, useState } from 'react';
import * as wanakana from 'wanakana';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { tokenize } from 'react-native-japanese-text-analyzer';
import levenshtein from 'fast-levenshtein';

import { Alert } from '../components/atoms/Alert';
import { t } from 'i18next';
import { getDatabase } from '../utils/SQLite';
import { SQLiteDatabase } from 'expo-sqlite';

export type UseDictionaryInputReturnType = {
  queryString: string;
  isListening: boolean;
  filteredData: string[];
  handleKeybordSearch: (text: string) => void;
  setQueryString: React.Dispatch<React.SetStateAction<string>>;
  stopListening: () => void;
  startListening: () => void;
  setFilteredData: React.Dispatch<React.SetStateAction<string[]>>;
  setFilterString: React.Dispatch<React.SetStateAction<string>>;
};

export const useDictionaryInput = (table: string, initialValue: string): UseDictionaryInputReturnType => {
  const [queryString, setQueryString] = useState(initialValue);
  const [isListening, setIsListening] = useState(false);
  const [filteredData, setFilteredData] = useState<string[]>([]);
  const [filterString, setFilterString] = useState('');
  const [db, setDb] = useState<SQLiteDatabase | undefined>(undefined);

  const scoreItem = (query: string, item: string) => {
    const distance = levenshtein.get(query, item);
    const score = 1 / (1 + distance);
    return score;
  };

  const queryData = useCallback(
    (rawQuery: string) => {
      try {
        //先頭からの完全一致と部分一致を取得する
        //完全一致は昇順、部分一致はスコア順に並べる
        //完全一致と部分一致で重複するものは完全一致のみにする

        if (db === undefined) return;

        // 音声入力では文章ごと認識され長くなることがある。
        // 2-gram展開でLIKE条件を大量にOR連結するとSQLiteの式深さ/変数数の上限を超えて
        // getAllSyncが例外になる（特にiOS）。そのため2-gram生成は先頭の一定長に制限する。
        const query = rawQuery.trim();
        if (query === '') {
          setFilteredData([]);
          return;
        }
        const QUERY_PART_MAX_LEN = 30;
        const partSource = query.slice(0, QUERY_PART_MAX_LEN);

        //console.log('B', query);
        const queryParts = [query];
        for (let i = 0; i < partSource.length - 1; i++) {
          queryParts.push(partSource.slice(i, i + 2));
        }

        const queryConditions = queryParts.map(() => `value LIKE ?`).join(' OR ');

        const exactMatchSQL = `SELECT value FROM "${table}" WHERE value LIKE ? AND ${filterString} LIMIT 10;`;

        const partialMatchSQL = `SELECT value FROM "${table}" WHERE (${queryConditions}) AND ${filterString};`;
        // console.log(partialMatchSQL);

        const paramsExact = [query + '%'];
        const paramsPartial = queryParts.map((part) => '%' + part + '%');

        const exactRows = db.getAllSync(exactMatchSQL, paramsExact);
        const partialRows = db.getAllSync(partialMatchSQL, paramsPartial);

        const queriedDataExact = exactRows.map((item: any) => item.value);

        queriedDataExact.sort((a, b) => a.localeCompare(b, 'ja-JP'));
        const queriedDataPartial = partialRows
          .map((item: any) => item.value)
          .filter((value) => !queriedDataExact.includes(value));
        queriedDataPartial.sort((a, b) => scoreItem(query, b) - scoreItem(query, a)).splice(10);
        const finalData = [...queriedDataExact, ...queriedDataPartial];
        setFilteredData([...finalData, query]);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('queryData failed:', e);
        setFilteredData(["Can't access database!", rawQuery]);
      }
    },
    [db, filterString, table]
  );

  const handleKeybordSearch = (text: string) => {
    const formattedQuery = wanakana.toKatakana(text.toLowerCase());
    queryData(formattedQuery);
    //queryVoiceData(formattedQuery);
    setQueryString(text);
  };

  useEffect(() => {
    (async () => {
      const db_ = await getDatabase();
      setDb(db_);
    })();
  }, []);

  useEffect(() => {
    setQueryString(initialValue);
  }, [initialValue]);

  // 音声認識結果を辞書検索用クエリへ変換する。
  // 日本語形態素解析(tokenize)で漢字を読み(カタカナ)へ変換するが、
  // Web等でネイティブ解析が使えない場合は認識テキストをそのまま使う。
  const applyVoiceResult = useCallback(
    async (voiceInput: string) => {
      if (!voiceInput) return;
      let katakanaOutput = voiceInput;
      try {
        const result = await tokenize(voiceInput);
        if (result.length > 0) {
          katakanaOutput = result
            .map((item) => {
              return item.pronunciation === '*' || item.pronunciation === '' ? item.surface_form : item.reading;
            })
            .join('')
            .replace(/\s+/g, '')
            .toLowerCase();
        }
      } catch {
        // tokenizeが利用できない環境では認識テキストをそのまま使用する
      }
      const formattedQuery = wanakana.toKatakana(katakanaOutput);
      queryData(formattedQuery);
      setQueryString(katakanaOutput);
    },
    [queryData]
  );

  // expo-speech-recognitionのイベント購読（マウント中は自動でクリーンアップされる）
  useSpeechRecognitionEvent('start', () => setIsListening(true));
  useSpeechRecognitionEvent('end', () => setIsListening(false));
  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    // eslint-disable-next-line no-console
    console.error('SpeechRecognition error:', event.error, event.message);
  });
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    applyVoiceResult(transcript);
  });

  const stopListening = useCallback(() => {
    setIsListening(false);
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }, []);

  const startListening = useCallback(async () => {
    setQueryString('');
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('', t('common.notSupported'));
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'ja-JP',
        interimResults: false,
        continuous: false,
      });
    } catch (e) {
      setIsListening(false);
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }, []);

  return {
    queryString,
    filteredData,
    isListening,
    setQueryString,
    setFilteredData,
    handleKeybordSearch,
    stopListening,
    startListening,
    setFilterString,
  } as const;
};

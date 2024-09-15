import { useCallback, useEffect, useState } from 'react';
import * as wanakana from 'wanakana';
import Voice from '@react-native-voice/voice';
import { tokenize } from 'react-native-japanese-text-analyzer';
import levenshtein from 'fast-levenshtein';
import _ from 'lodash';

import { LogBox, Platform } from 'react-native';
import { Alert } from '../components/atoms/Alert';
import { t } from 'i18next';
import { getDatabase } from '../utils/SQLite';
import { SQLiteDatabase } from 'expo-sqlite';
LogBox.ignoreLogs(['new NativeEventEmitter()']);

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
    (query: string) => {
      try {
        //先頭からの完全一致と部分一致を取得する
        //完全一致は昇順、部分一致はスコア順に並べる
        //完全一致と部分一致で重複するものは完全一致のみにする

        if (db === undefined) return;
        //console.log('B', query);
        const queryParts = [query];
        for (let i = 0; i < query.length - 1; i++) {
          queryParts.push(query.slice(i, i + 2));
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
        setFilteredData(["Can't access database!", query]);
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

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Voice.onSpeechResults = _.debounce(async (e: any) => {
      const voiceInput = e.value[0];
      const result = await tokenize(voiceInput);
      if (result.length === 0) return;
      const katakanaOutput = result
        .map((item) => {
          return item.pronunciation === '*' || item.pronunciation === '' ? item.surface_form : item.reading;
        })
        .join('')
        .replace(/\s+/g, '')
        .toLowerCase();
      // 関数内で最新のステートを参照するために、ref を利用します。
      const formattedQuery = wanakana.toKatakana(katakanaOutput);
      queryData(formattedQuery);
      setQueryString(katakanaOutput);
      await stopListening();
      //Voice.destroy().then(Voice.removeAllListeners);
    }, 400);
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, [queryData]); // この useEffect は最初のマウント時のみ実行します。

  const startListening = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('', t('common.notSupported'));
      return;
    }
    setIsListening(true);
    setQueryString('');
    try {
      await Voice.start('ja-JP');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    //setTimeout(async () => await stopListening(), 5000);
  };

  const stopListening = async () => {
    setIsListening(false);
    try {
      await Voice.stop();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

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

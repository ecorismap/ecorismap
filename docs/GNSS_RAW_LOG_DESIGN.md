# 外部GNSS受信機のRAWデータ記録（設計検討）

2026-11-28 検討・方針決定・実装（`feature/gnss-raw-log`）。実機は未確認。

## 目的

外部GNSS受信機の出力（UBXのRAW観測データなど）をそのままファイルに残し、
後でRTKLIB等で後処理（PPK）できるようにする。

想定する使い方:

1. **山間部などでRTKがFIXしなかった現場の救済** — 受信機のRAWと、NTRIPで受け取っていた補正（VRSのRTCM）を両方残しておけば、
   帰ってからRTKLIBで解き直せる（基準局側は残したRTCM、または後から入手する電子基準点のデータ）。
2. **静止観測（スタティック）** — 基準点や境界杭の上で数分〜数十分RAWを取り、後処理で精度を上げる。
3. **不具合の調査** — 受信機が何を出していたかをそのまま残せる。

アプリ内での後処理（RTKLIBの組み込み）はしない。RINEXへの変換もアプリではやらず、PCの`convbin`（RTKLIB）に任せる。

## 現状

- 受信機のバイト列は、USB・BLE・SPPのどれでも`GnssSession`（Android: `GnssSession.kt`、iOS: `GnssSession.swift`）の
  `onData`に集まる。
- そこから`NmeaLineAssembler`がNMEA文（`$`〜改行の印字可能ASCII）だけを切り出し、UBX等のバイナリは捨てている。
- NTRIPの補正は`NtripClient` → `GnssSession.onCorrection` → `link.write`で受信機へ流しているだけで、残していない。

→ **合流点が1か所なので、そこでバイト列を書き出せば全部の接続方式・両OSに効く。** NMEAの解釈には手を入れない。

## 方式

### 記録するもの

| ファイル | 中身 | 拡張子 |
|---|---|---|
| ローバー（受信機の出力） | 受信機から届いたバイト列を**加工せずそのまま**（NMEA・UBX等が混在） | `.ubx`（UBXの同期バイト`B5 62`を見つけたら）／それ以外は`.raw` |
| 補正（NTRIPがONのとき） | キャスターから受け取ったRTCMをそのまま | `.rtcm3` |
| 記録の情報 | 開始・終了時刻、受信機名、接続方式、アンテナ高、NTRIPのホスト・マウントポイント、バイト数 | `.json` |

- 加工しないので、u-blox以外（Unicore、Septentrioなど）の独自形式も、そのまま残せる。変換は利用者が機種に合ったツールで行う。
- ファイル名は`YYYYMMDD_HHMMSS_<受信機名>.ubx`など。1回の記録で3つが同じ名前の組になる。
- アンテナ高はRINEXのヘッダに要るので、記録の情報のJSONに必ず残す。

### 書き出し（ネイティブ）

- `GnssSession`に`RawLogger`を足す。`onData`と`onCorrection`の中で、NMEAの解釈・受信機への中継と並べて`logger?.write(bytes)`を呼ぶ。
- `BufferedOutputStream`（iOSは`FileHandle`＋自前のバッファ）で書き、**1秒ごとにflush**する。
  プロセスが落ちても、失うのは最後の1秒程度。
- 書き込みは受信スレッド上で、バッファに足すだけにする。ディスクへの書き出しは専用スレッドで行い、受信を止めない。
- ディスクがいっぱいになるなど、書けなくなったら記録を止めて状態をエラーにする。受信機の接続とNTRIPは止めない。
- **リンクが切れても記録は止めない。** 再接続したら同じファイルに書き足す（convbinは途切れを扱える）。
  止めるのは利用者が「停止」を押したときだけ。

### 量の目安

u-bloxのRAWX＋SFRBXを1Hzで出した場合、毎秒2〜3KB（NMEA込み）、**1時間で約10MB**。5Hzならその5倍。
USB・SPPは問題ない。BLE（Nordic UART）はMTU 247で交渉済みで、1Hzなら足りる見込み。高い更新レートでは機種による。

### アプリ側

- **開始・停止**: 外部GNSS受信機の欄に「RAW記録」の開始・停止ボタンを置く。記録中は経過時間とサイズを出す。
- **地図上の表示**: 記録中は、GPSボタンの長押しで出る詳細パネルに「RAW記録中」と出す。記録したまま忘れないようにするため。
- **ファイルの一覧**: GPSの設定に「RAW記録ファイル」の一覧を置き、共有（既存の`Sharing.shareAsync`の経路）と削除をできるようにする。
  3つのファイルの組は、zipにまとめて1つで共有する（既存の`generateZipFile`を使う）。
- **保存先**: アプリのドキュメント領域の`gnss-raw/`。設定やDriveへの保存（バックアップ）の対象にはしない（大きいため）。
- **Web**: 対象外（外部受信機をつながないため）。

### バックグラウンドとプロセスの維持

外部受信機は、プロセスを維持するのに独自のフォアグラウンドサービスを持たない。
background-geolocationのサービスに乗っていて、GPSがOFFで記録もしていない間にバックグラウンドへ移ると、
受信機を切り離す（`useExternalGnssAutoConnect`のT-M6）。

→ **RAW記録中は「位置を使っている」扱いにする。** `isLocationInUse`の条件に「RAW記録中」を足し、
バックグラウンドで切り離されないようにする。ただし、background-geolocationのサービスが動くのはGPSがONか軌跡の記録中だけ。
なので、**RAW記録はGPSがONのときだけ開始できる**ことにする（開始時にGPSがOFFなら、ONにするよう知らせて始めない）。

### 受信機の設定

受信機がRAWを出すように設定するのは、利用者が受信機の設定ソフト（u-centerなど）で行う。
アプリから受信機の設定を書き換える（UBX-CFG-VALSETなど）のは、機種依存で事故の元になるので、この段階では行わない。

記録しているのにUBXの同期バイトが一度も来なかったら、開始から30秒後に「受信機がRAWデータを出していないようです」と知らせる。

## 決定事項（2026-11-28）

1. **開始・停止は独立したボタン**にする。軌跡の記録とは連動させない（静止観測にも使えるように）。
2. **NTRIPの補正（RTCM）も残す。既定はON**にする。キャスターの利用規約は利用者が確認する（設定とマニュアルに注記する）。
3. **AndroidとiOSを同時に作る。** iOSのBLEの実機確認は後で行う。
4. **容量の上限は設けない。** 一覧から削除してもらう。空き容量がなくなったら記録を止めて、エラーを出す。

## 作業の見積もり

- ネイティブ: `RawLogger`（Android／iOS 各100〜150行）、`GnssSession`への組み込み、開始・停止・一覧・削除の関数。
- JS: 設定画面の記録ボタンとファイル一覧、zip共有、`isLocationInUse`の条件、翻訳、マニュアル、台帳。
- テスト: `RawLogger`の書き出し・flush・再接続をまたいだ書き足しは、ネイティブなのでJestでは見られない。
  JS側の状態遷移はJestで見る。実機で、u-bloxのRAWX→`convbin`→RINEXまで通す。

## 実装メモ（2026-11-28）

- ネイティブ: `RawLogger.kt` / `RawLogger.swift`。`GnssSession`の受信（`onData`/`feed`）と補正の中継（`onCorrection`/`relayCorrection`）から書く。
  状態は`status().rawLog`で返し、記録中は1秒ごとの書き出しのたびに`onStatus`を出す（経過時間・サイズの表示更新）。
- 関数: `startRawLog(dirPath, baseName, logCorrections)` / `stopRawLog()`（残ったファイルの情報を返す）。
- 保存先: `RNFS.DocumentDirectoryPath/gnss-raw`（JSで決めてネイティブへ渡す）。記録の情報（.json）はJSが開始時に書き、停止時に終了時刻とバイト数を足す。
- 共有: `react-native-zip-archive`でネイティブにzipし、`exportFileFromUri`（Androidは保存か共有を選べる）。JSのメモリを通さない。
- 「切断」を押したら、RAW記録も止める。リンクがエラーで切れたときは止めない。
- `isLocationInUse`に第3引数（RAW記録中）を足し、Homeは`useExternalGnssRawLogging()`で渡す。
- 同時に、接続した直後に切れると「接続済み」のまま残る問題をiOSの`GnssSession.attachLink`でも直した（Androidは`feature/gnss-spp`で修正済み）。

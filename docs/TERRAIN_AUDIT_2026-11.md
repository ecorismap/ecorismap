# 3D・眺望の監査（2026-11）

2026-11-23 実施。3D 地形表示と眺望で次のことが起きる経路を探した。表示が崩れる・固まる。カメラが意図しない位置・角度になる。2D と 3D の往復で位置やズームがずれる。タップや長押しが効かない、または見えていないものが選ばれる。地物が地形に埋もれる・浮く・山を透けて見える。Web とネイティブで見え方が食い違う。

- **範囲**: ネイティブの WebGPU 3D 地形（`src/utils/terrain3d/*`、`HomeTerrain3D*.tsx`、`useTerrain3D*.ts`）、Web の 3D（`webTerrainView.ts`、`webVista.ts`、`webCamera.ts`、`webLowCameraGuard.ts`）、眺望（vistaStore、山名ラベル、画角ズーム、方位追従・現在地追従）、可視領域（viewshed、viewshedMask、3D 表示）、3D 上のポイント・軌跡・現在地。地図タイル・DEM の取得とキャッシュは `docs/TILE_AUDIT_2026-11.md` で監査済みなので除いた。
- **方法**: 観点（ライフサイクル、描画、オーバーレイ、眺望、Web）ごとに候補を出し、重複をまとめた。各候補を3人が別々に検証し、実在するか、重大度、分類、手順に訂正があるかを投票した。重大度・分類は3票の多数に従い、訂正は本文に反映した。メモリに記録済みの既知・意図した仕様（遠景の分割数、眺望の崩れ＝地形、親タイルフォールバック、眺望の足元標高の追い直し、軌跡の眺望中非表示など）は再報告していない。
- **結果**: 確認 19件（**high 0、medium 9、low 10**）。反証 0件（重複をまとめる前の候補は 27件）。
- コードは変更していない。手順はコードとライブラリ（react-native-webgpu、maplibre-gl 5.24.0）のソースを読んで成り立つと確認したもので、実機では確かめていない。
- **分類**: **安全に直せる**＝挙動の方針を変えずに直せる。**判断が要る**＝挙動や仕様を変えるので、どちらにするか決める必要がある。

---

## 優先して直すもの（high）

該当なし。候補段階で high だった「通常3Dでカメラが山の中に入る」は、3票とも medium（表示の崩れとタップ不発にとどまり、データは失われない）としたので V-M2 に入れた。

以下、medium のうち影響が大きいものを先に詳しく書き、その後に表をまとめる。

### V-M1. 2D のヘディングアップ中に 3D へ入ると解除が空振りし、3D でもセンサーがカメラを回し続ける【安全に直せる】

- **手順**
  1. 2D でコンパスボタンを押してヘディングアップにする。
  2. そのまま 3D ボタンを押すか、2D の長押しメニューから「ここからの眺望」を選ぶ（どちらもヘディングアップを事前に解除しない。`useDrawTool.ts:1610-1631`、`HomePoiPopup.tsx:159-165`）。
  3. `isTerrainActive` が true になったレンダーで 2D の MapView がアンマウントされ、`mapViewRef.current` は null になる（`pages/Home.tsx:583-586`）。3D のハンドルが入るのは非同期の GPU 初期化の後（`HomeTerrain3D.tsx:451, 493-517`）。
  4. その間に `containers/Home.tsx:1980-1983` の effect が `toggleHeadingUp(false)` を呼ぶが、`resetHeading` の既定が true なので `useLocation.ts:1180` の `mapViewRef.current === null && (headingUp_ || resetHeading)` で即 return する。購読の解除も `setHeadingUp(false)` も行われず、effect の依存はその後変わらないので再実行されない。
  5. 3D のハンドルが入ると、残った heading 購読が `animateCamera({heading})` で 3D カメラを端末の向きへ回し続ける。ハンドルが入る前に方位が変わると、`useLocation.ts:1217` の `(mapViewRef.current as MapView).animateCamera` が null に対して呼ばれ TypeError になる。
- **影響**: メモリにある「3D 中はヘディングアップを自動解除する」という意図が崩れる。2 本指回転や見回しとセンサーが方位を取り合い、視線が勝手に回る。通常の 3D では `pressCompass` は北へ戻すだけ（`containers/Home.tsx:1946-1947`）なので止められず、2D へ戻ってコンパスを押し直すしかない。
- **訂正**: 眺望から入った場合は、眺望中のコンパスボタン（`containers/Home.tsx:1938-1940` の `toggleHeadingUp(false,false)` は ref が null でも進む）か、眺望の終了（1990-1997 行の購読）で解除できる。その間は `setVistaHeadingFollow(true)` のままで、選んでいない方位追従になり、moveToVista の北向きも上書きされる。抜けられなくなるのは通常の 3D ボタンで入った場合。
- **修正案**: 1180 行の早期 return を `headingUp_=true` のときだけにし、解除（false）は地図が無くても購読の除去と `setHeadingUp(false)` まで進める。北へ戻すカメラ操作だけを ref があるときに行う（1236 行付近は既に null を確かめている）。heading コールバックにも null チェックを入れる。

### V-M2. 通常 3D で最大近くまで傾けて下り斜面側を向くと、カメラが山の中に入り、手前の地形が消えてタップも効かなくなる【判断が要る】

- **原因**: `updateCameraMatrix`（`TerrainScene.ts:979-1003`）は注視点の高さを `targetElevation*elevScale` とし、`orbitEye`（`matrices.ts:111-123`）で視点を「注視点の高さ＋distance·cos(p)」、水平に distance·sin(p) 後ろへ置く。視点の真下の地形とはどこでも比べていない。`CameraController.pitchBy/animateTo`（156-161, 170-204）はピッチを `MAX_PITCH_DEG=80` で丸めるだけ。通常モードで追い直すのは注視点の標高（`TerrainScene.ts:1534-1540`）だけ。
- **条件**: elevScale の 1/cos(lat) は水平のメルカトル伸びと打ち消し合うので、強調は実質 1.5 倍。視点の背後が平均勾配 θ で登っていて `1.5·tanθ > cot(p)` なら視点が地中に入る。ズームには依らない。ピッチ 80° なら約 6.7°、70° で約 13.6°、60° で約 21°。リプレイ（ピッチ 68°）は約 15° で同じことが起きる（`applyReplayCamera` 692-711 も注視点標高しか追わない）。z16 で distance は約 2.9km あり、その範囲の平均勾配が 6.7° を超える山地は珍しくない。
- **影響**
  - 地形は `cullMode:'back'`（`TerrainRenderer.ts:552, 918`）なので、地中から見ると周りの面が抜けて、奥の地形やスカートの壁が見える。
  - `unprojectToLatLon`（`TerrainScene.ts:930-970`）は視点から始めて地上→地下へ移る点しか探さないので、注視点付近（画面中央付近）へのレイは地中を通ったまま交点が取れず null になり、長押しメニューやタップの情報表示が効かない。レイがいったん地上に出てから地形に当たる位置なら交点は返る（「必ず null」ではない）。
  - ポイントの遮蔽判定と地表への吸着も、地中から撮った距離バッファを基準にする。
- **修正案**: `updateCameraMatrix` で視点位置の標高（`sampleElevationAtMercator`）を引き、地表＋余裕より低ければ持ち上げる（maplibre と同じく注視点の高さを上げる）か、その場で有効ピッチを浅くする。どちらにするかで操作感が変わるので方針判断。リプレイにも同じ制限をかける。

### V-M3. ライン・ポリゴン・軌跡・可視領域の範囲円のドレープが、遠景リングの山を透かして描かれる【判断が要る】

- **原因**: `drawFrame`（`TerrainRenderer.ts:1071-1107`）は地形をリングごとに分けた深度レンジ（`ringDepthRange`、366-381。3 本なら外から [0.75,1]／[0.5,0.75]／[0,0.5]）で描き、オーバーレイは最後に1回だけ、近景のレンジ `ringDepthRange(ringCount-1)` で描く（設定は depthCompare `less-equal`・depthWrite なし・depthBias -4、553-590）。`OVERLAY_SHADER` は近景の範囲外を捨てない。オーバーレイの標高は `sampleElevation`（`TerrainScene.ts:852-863`）が全リングから引くので、近景リングの外の地物もドレープとして作られる。
- **手順**: 3D（例: z14、ピッチ 60°）や眺望で、近景リング（z14 で半径約 9.5km、z16 で約 2.4km）より遠いラインや範囲円を、手前の遠景リングの尾根の陰になる向きで見る。遠景にあるオーバーレイ断片の深度は必ず近景レンジ（0.5 未満など）に収まり、遠景の地形（0.5 以上）より手前と判定される。
- **訂正**: 遮る尾根が近景リングの中にあれば同じレンジどうしで比べるので正しく隠れる。誤るのは遮る地形も近景リングの外にある場合。眺望中は軌跡が非表示（`HomeTerrain3DTrack.tsx:56-71`）なので、眺望で透けるのはレイヤのライン・ポリゴンと可視領域の範囲円。眺望の望遠（画角 30° 以下）では最後に描く最も細かい扇形リングのレンジになり、それより粗いリングの遮蔽物に効かない。この作りは WebGPU 移行前（深度クリア方式）からあり、B2（深度レンジ分割）で入った退行ではない。
- **影響**: 尾根の向こうの線・塗り・範囲円が手前の山の上に描かれる。眺望や低い角度で遠くを見るとよく起きる。
- **修正案**: 描き方の作り直しが要る。例: 地形描画時にステンシルへ「その画素の最前面のリング番号」を書き、オーバーレイをリングごとにそのリングの深度レンジで、ステンシルが一致する画素にだけ描く。性能と見え方の兼ね合いで方針判断。

---

## medium

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| V-M1 | 2D のヘディングアップ中に 3D へ入ると解除が空振りし、3D カメラがセンサーで回り続ける（上記） | 安全 | `useLocation.ts:1177-1180, 1217`、`containers/Home.tsx:1977-1997`、`pages/Home.tsx:583-586`、`HomeTerrain3D.tsx:451` | 解除は ref が無くても購読除去と setHeadingUp(false) まで進め、北へ戻すカメラ操作だけ ref があるときに行う。コールバックに null チェック |
| V-M2 | 傾けて下り斜面側を向くとカメラが地中に入り、手前が消え、画面中央付近のタップ・長押しが効かない（上記） | 判断 | `TerrainScene.ts:979-1003, 1534-1540, 692-711, 930-970`、`matrices.ts:111-123`、`CameraController.ts:156-161, 170-204` | 視点の真下の標高で視点を持ち上げるか、ピッチを浅くする。リプレイにも適用 |
| V-M3 | ドレープが遠景リングの山を透かして描かれる（上記） | 判断 | `TerrainRenderer.ts:366-381, 553-590, 1071-1107`、`TerrainScene.ts:852-863, 1555-1570` | ステンシルでリング番号を持たせ、オーバーレイをリングごとに描く等 |
| V-M4 | ドレープの作り直しと距離バッファの撮り直しが、近景リングの `readyGeneration` しか見ていない。3D を開いて操作せずに待つと、最初のオーバーレイ構築は遠景リングの読み込み開始（`FAR_RING_START_DELAY_MS`=700ms か近景1枚目の描画後、1491-1494）より前に走り、近景の外の頂点は 0m（`overlayGeometry.ts:100-113`）で hadMissing になる。近景が揃った後に遠景が届いても `readyGen` は近景のものなので retry が立たず、0m のまま残る。距離バッファも同じで、後から描かれた遠景の尾根がバッファに入らず、撮影時に空（Infinity）だった画素では `isOccluded` が「隠れていない」と判定する。尾根の陰の調査ポイント・通常 3D の山名・軌跡フォーカスマーカー・現在地が透けて表示され、`placeOnDrawnTerrain` も古い地表に吸着する。さらに (A) 遠景の粗い DEM で値が取れた地物は hadMissing=false で確定し、同じズームのままパンして近景タイルが届いても作り直されない。(B) ズーム切替直後は旧ズームのタイル（`TerrainTileManager.ts:369-379, 401`）で焼かれ、新ズームが揃っても作り直されない。いずれもカメラを動かすかデータが変わるまで直らない。眺望の山名は視線判定（sightline）なので該当しない。1247-1250 行の「近景の外は永久に標高が取れない」というコメントも全リング探索と食い違う古い前提 | 安全 | `TerrainScene.ts:1264-1276, 1590-1592, 852-864, 1205-1219, 1025-1059`、`TerrainTileManager.ts:469`、`overlayGeometry.ts:100-113` | 全リング（`managerOrder`：近景・遠景・扇形）の readyGeneration の合計を世代として、作り直しと撮り直しの両方を判定する（2 秒の間引き・静止時のみ撮る条件はそのまま）。(A)(B) まで直すには、sampler が近景以外（その地点を覆う最も細かいリング以外）から取った値を `hadCoarse` などで記録し、要再構築として扱う。3票中1票はこの (A)(B) 部分を再構築回数が増える挙動変更として「判断」に分けるべきとした |
| V-M5 | 眺望中、近くのライン・ポリゴンの塗りが目の高さより上に浮き、ポリゴンの中に立つと頭上が塗りの色で覆われる。浮かせ量は `overlayLiftMeters(zoomToDistance(state.zoom))`（0.3〜3m、距離×0.001）で、眺望は zoom を変えない（`moveToVista` 562-590 は heading/pitch だけ、ピンチは画角だけ）。画面高さ約 800dp なら z15 以下で上限 3m、z16 で約 1.65m になり、目の高さ 1.7m（`VISTA_EYE_HEIGHT_M`）を超えるかほぼ並ぶ。オーバーレイは `cullMode:'none'` なので下からも描かれ、レイヤのライン・ポリゴン（`dataOverlaySpecs`）と範囲円は眺望中も描かれ続ける。平坦な調査区の中で水平に見ると、地平線のすぐ上から真上までが不透明度 0.35 の塗りに染まる。z17 以上から入った場合、目の高さを 5m 以上にした場合は起きない | 安全 | `TerrainScene.ts:1417, 1566, 815-829, 562-590`、`overlayGeometry.ts:70-85`、`TerrainRenderer.ts:221, 580-589, 979`、`HomeTerrain3D.tsx:87, 195-256` | `this.vista !== null` のときだけ浮かせ量を `min(overlayLiftMeters(distance), 0.3)`（または `vista.heightM×0.2`）にする。通常 3D は変わらない |
| V-M6 | 眺望や傾けた 3D で、入ったときのズームで決まる距離より先の地形をタップ・長押ししても反応せず、そこに描かれた調査ポイントも選べない。`unprojectToLatLon` は `maxT = zoomToDistance(state.zoom)*8`、等間隔 200 ステップ（942-943）。眺望は zoom を変えないので、画面高さ 800dp で z16 なら上限約 13km（メルカトル、緯度 35° で地上約 11km）、z17 なら約 6.6km。描画は遠景リングで数十〜数百 km 先まで出ている。長押し（`HomeTerrain3D.tsx:635-636`）は null を「空を指した」として return しメニュー（可視領域作成・ここからの眺望・標高）が出ない。タップ（651-652）も null で return するので、その後の画面距離によるポイントのピック（654 以降）まで進まない。刻みが maxT/200（z13 の眺望で約 580m）と粗く細い尾根を飛び越える可能性もあるが、こちらは地形しだいで未検証 | 安全 | `TerrainScene.ts:930-971`、`HomeTerrain3D.tsx:632-680` | 眺望中（と通常 3D も）探索上限を描画しているファー面（最外リング半径・fogFar 相当）にし、刻みは近いほど細かい対数間隔＋二分法。タップは unproject が null でもポイントの画面ピックを先に行う（null のときは位置が無いのでベクタタイル属性は呼ばない） |
| V-M7 | 3D のカメラ位置が mapRegion へ最後まで同期されず、2D へ戻ると慣性移動前・ズーム前の位置に戻る。(a) パンの onEnd（710-716）は指を離した位置で `syncRegion(true)` してから慣性（時定数 320ms、`CameraController.ts:214-224`）を始め、止まった後の同期は無い。`TerrainScene` の cameraActive の true→false（1395-1401）は dirty を立てるだけ。(b) パンやピンチの後 1 秒以内にズームボタンを押すと、animate の 280ms 後の `syncRegion(false)` が 1000ms スロットル（`REGION_SYNC_THROTTLE_MS`）で捨てられ、後追いの同期も無い。ズーム表記・線幅換算（mapRegion 由来の zoom）も古いまま。連打時は `syncTimerRef` が残って2回目の予約が積まれず、タイマーは2回目のアニメーション途中の値を書く。(c) アンマウント（599-613）は clearTimeout だけで最終同期しない。3D 終了時は `toggleTerrain(false)`（`useDrawTool.ts:1632-1639`）が古い mapRegion に pitch/bearing=0 を付けて渡し、2D は `initialRegion={mapRegion}`（`pages/Home.tsx:589`）で開く。データは失われないが、3D と 2D の往復で毎回起こり得る | 安全 | `HomeTerrain3D.tsx:302-329, 375-379, 599-613, 710-716`、`CameraController.ts:78-87, 214-224`、`TerrainScene.ts:1395-1401`、`constants.ts:246`、`useDrawTool.ts:1632-1639` | cameraActive の true→false（`TerrainScene.ts:1399`）で外部コールバックを呼び `syncRegion(true)` する。スロットルで捨てたときは残り時間後に末尾同期を予約する。アンマウント時の同期は toggleTerrain の dispatch より後に走り pitch/bearing=0 を上書きし得るので、Terrain3DHandle に現在カメラを返す API を足して toggleTerrain(false) が center/zoom を読んでから 0 化する形にするか、末尾同期で mapRegion を常に最新に保つ |
| V-M8 | 眺望中にバナーを使わず 3D ボタンで 2D へ戻ると、立ち位置ではない場所が開く。ネイティブ: 眺望中は `applyVistaCamera`（815-829）がカメラ中心を立ち位置から視線方向へ `zoomToDistance×sin(pitch)` 先の注視点に置き、`syncRegion` がそれを mapRegion に書く（moveToVista の `VISTA_DURATION_MS`+80ms 後 414 行、見回し終了 715 行、高さ変更 422 行）。3D ボタンは眺望中も出ていて（`pages/Home.tsx:734-742`）、dispose（1693-）は vista を消すだけで同期し直さない。2D の中心は向いていた方向へ z16 で約 1.8km、z13 で約 14km 先になり、z16 では立ち位置が画面外に出る。Web: 眺望中は Map が非制御（`Home.web.tsx:898`）だが jumpTo のたびに onMove→changeMapRegion が走り、mapRegion は約 40m 先の注視点・約 z20.5 になる。3D を抜けると `clearWebVista(false)` はカメラに触らず、2D は立ち位置付近を z20.5 前後の超拡大で開く。バナーから抜ければ clearVista／clearWebVista(true) で立ち位置の俯瞰に戻るので、抜け方で戻り先が違う。414 行のコメント「2D へ戻したときの位置」とも合わない。3票中1票は low | 判断 | `HomeTerrain3D.tsx:302-329, 404-415, 422, 710-716`、`TerrainScene.ts:815-829, 838-850, 1693-1697`、`useDrawTool.ts:1632-1640`、`pages/Home.tsx:734-742`、`webVista.ts:38-44, 106-132`、`Home.web.tsx:197-203, 898-903` | 3D を抜ける経路（toggleTerrain(false) の手前か終了処理）で、眺望中ならネイティブは clearVista 相当、Web は clearWebVista(true) 相当で立ち位置中心の region を mapRegion に書いてから 2D へ渡す。または眺望中の同期で注視点ではなく立ち位置を書く。戻すズーム（眺望前の値か EXIT_ZOOM 15 か）を決める |
| V-M9 | Web 眺望の足元標高待ち（`waitForGround`）が実際には待たず、2D から入ると視点が海抜 0m 付近（山の中）に置かれる。toggleTerrain が setTerrain を同期で呼ぶ（`useDrawTool.ts:1629`）ので、startWebVista の時点で `map.terrain` はある。maplibre 5.24.0 の `queryTerrainElevation` が null を返すのは terrain が無いときだけで、DEM タイルが未着でも `getDEMElevation` が読み込み済みの親タイルの値か `if (!dem) return 0` で 0 を返す（`node_modules/maplibre-gl/src/render/terrain.ts:194-200`、`terrain_tile_manager.ts:270-284`）。2D の間は rasterdem を使うレイヤが無く DEM が1枚も無いので、1 回目のループで 0 が返り、5 秒待機も `getDemElevation` フォールバックも働かない。目は 0＋1.7m に置かれ、直るのは onIdle（242-250）で取り直したとき（眺望は 300km 先まで読むので数秒〜十数秒）。3D から入った場合は粗い親タイルの値になり、山頂付近では地面の下に潜ることがある。`_elevateCameraIfInsideTerrain` が俯角・ズームまで書き換えるかは実機未確認 | 安全 | `webVista.ts:196-212, 242-250, 275-303`、`Home.web.tsx:197-203`、`useDrawTool.ts:1626-1631`、maplibre `camera.ts:1675-1680` | `queryGround` で足元を含む最大ズーム（rasterdem の maxzoom=15）の DEM が読み込まれているかを `map.terrain.tileManager.getSourceTile(tileID)`（searchForDEM なし）の `tile.dem` で確かめ、無ければ null を返して待つ。期限切れなら既存の getDemElevation フォールバック。idle 以外（rasterdem の sourcedata など）でも足元を取り直す |

## low

| # | 内容 | 分類 | 箇所 | 修正案 |
|---|---|---|---|---|
| V-L1 | GPU デバイスロスト後の作り直しで、視点が 3D に入った地点へ戻り、眺望も解除される（`initScene` が `useCallback(…, [])` で初回の mapRegion を閉じ込めている）。あわせて、作り直し時に `resizeCanvas` が寸法不変で早期 return し `context.configure({device: 新デバイス})` を呼ばないため、旧デバイスのサーフェスのテクスチャを新デバイスで使い描画が固まる、と2票が判定した。1票は、作り直しの `getContext('webgpu')` が毎回新しい Canvas（幅・高さは DIP）を作るので、PixelRatio>1 の端末では物理ピクセルとの比較が食い違い configure は呼ばれる、として固まる点を否定した。3D を抜けて入り直せば戻る。デバイスロスト自体がまれ | 安全 | `HomeTerrain3D.tsx:333-342, 453-455, 463-476, 493-517`、`react-native-webgpu` の `Canvas.tsx:108-126`・`GPUCanvasContext.cpp`・`SurfaceRegistry.h` | 作り直しでは寸法比較に関係なく configure を呼ぶ（構成済みデバイスを覚え、違えば構成し直す）。初期視点は旧シーンの `controller.getState()` か最新 mapRegion の ref から作る |
| V-L2 | 眺望に入って 0.6 秒以内にバナーの × で解除すると、残った補間で通常 3D のカメラが水平（俯角 90°）になり、方位も北へ回る。`moveToVista` が pitch→90・heading→0 の tween（600ms、上限 120）を張り、`clearVista` の `animateTo({center, pitch:60}, 0)` は duration 0 の分岐で値を書くだけで tween を消さない。次フレームから `update` が残った tween で上書きし、通常の上限 80° を超えた水平視線が残る。ジェスチャか傾きボタンで戻る。リプレイ開始経由の clearVista は直後に tween を張り直すので起きない | 安全 | `TerrainScene.ts:584, 838-850`、`CameraController.ts:169-186, 242-251` | `CameraController` に public な `cancelAnimations` を足し、`clearVista` の先頭で呼ぶ（heading は clearVista の target に無いので、duration 0 分岐で書いたプロパティの tween を消すだけでは止まらない）。あわせて duration 0 分岐で書いたプロパティ（center→lonMerc/latMerc、heading、zoom、pitch）の tween を消す |
| V-L3 | 眺望中に、データ編集・データ一覧（絞り込み範囲）・プロジェクト編集から「ジャンプ」しても視点が動かない。`changeMapRegion(jumpTo, true)`→3D ハンドルの `setCamera({center, zoom})`→`animate(camera, 0)` で中心が書き換わるが、次フレームの `applyVistaCamera` が立ち位置から注視点を導出し直して上書きする（animate が center を捨てるのはリプレイ中だけ）。変わるのは zoom だけで、注視点距離や長押しの届く距離が変わる。眺望は解除されず、メッセージも出ず、ボトムシートだけが閉じる。眺望バナー（閉じるボタン付き）は出ているので抜ける手段はある。GPS 追従・現在地ボタンの center が打ち消される点は、現在地以外からの眺望で立ち位置を固定する意図とも読めるので、不具合の根拠からは外し方針確認に回す | 判断 | `TerrainScene.ts:815-829, 1403-1407`、`CameraController.ts:170-186`、`HomeTerrain3D.tsx:356-403`、`useMapView.ts:141-149`、`containers/Home.tsx:3451-3460` | 眺望中に外部から center 付きの setCamera／animateToRegion が来たら clearVista してから移動するか、移動先の眺望へ移る（HomeTerrain3D の handle で処理）。GPS 追従は現在地からの眺望の追従と区別して別に扱う |
| V-L4 | 標高の強調倍率が 3D を開いたときの緯度で固定され、3D のまま南北へ大きく移動すると起伏の強さがずれる。`origin`・`elevScale`（1.5/cos(lat0)）はコンストラクタで1回だけ決まり、シーンの作り直しはデバイスロスト時だけ（initScene の依存が空）。北緯 26° で開いて 43° へパン・ジャンプ・追従すると、移動先は約 19% 平らに描かれる（眺望の目の高さも同率）。地形とポイント・軌跡の相対位置は崩れない。日常の調査範囲（緯度 1° 未満）では 1〜2% で目立たない。開き直せば直る | 判断 | `TerrainScene.ts:379-380`、`coords.ts:109-111`、`HomeTerrain3D.tsx:342, 476` | 注視点が一定以上（例: 緯度 2°）離れたら操作の終わり（endInteraction）で origin・elevScale を取り直し、タイル・遠景リング・オーバーレイを作り直す。または elevScale を uniform として毎フレーム更新し、焼き込み済みの y・カリング・点の配置もそろえる。どちらも見た目が変わる |
| V-L5 | Web の 3D／眺望で、メンバー位置・軌跡フォーカスマーカー・現在地ドット（GeolocateControl）がカメラの背後にあっても表示され、前方の空に鏡写しで浮く。maplibre の `Marker._update` は `map.project()` の結果をそのまま使い、mercator では背後の点を間引かない（`marker.ts:628-668`、`_updateOpacity` の `isLocationOccluded` は globe 専用）。背後判定 `createBehindCameraTest` を当てているのは `HomePoint.web.tsx` だけ（`webCamera.ts` 冒頭のコメントにある、調査ポイントで実際に起きた症状と同じ）。眺望中もこれらは表示し続けている。測定点マーカー（`HomeMeasure.web.tsx`）も同じ作りと1票が指摘 | 安全 | `HomeMemberMarker.web.tsx:17-18`、`HomeTrackFocusMarker.web.tsx:13-14`、`pages/Home.web.tsx:929-949`、`HomePoint.web.tsx:56-114`、`webCamera.ts:1-45` | HomePoint.web の render/idle 判定（`createBehindCameraTest`→visibility:hidden）を共通フックに切り出し、Member・Focus・測定点に当てる。現在地ドットは Marker の参照が取れないので、眺望中は CSS で `.maplibregl-user-location-dot`／`-accuracy-circle` を隠すか背後判定を当てる。地形遮蔽（maplibre の 20% 表示を消す）まで当てるのは見え方の変更なので別に判断 |
| V-L6 | 3D で表示していない（上限 300 点を超えた）ポイントがタップで選ばれる。`HomeTerrain3DPoints` はデータ順に 300 件（`MAX_3D_POINTS`）で打ち切るが、タップのピックは全件を `projectToScreen` して 20dp 以内の最寄りを選ぶ。何も描かれていない場所をタップすると、見えないポイントの編集画面が開く。開くのは実在のレコードでデータは壊れない。表示上の上限自体はメモリにある意図した仕様 | 安全 | `HomeTerrain3DPoints.tsx:26, 53-74`、`HomeTerrain3D.tsx:651-669`、`containers/Home.tsx:2837-2895` | 選定（可視レイヤ・可視レコード・300 件）を共通関数にし、items とタップのピックで同じ結果を使う。完全に塞ぐなら、3D から呼ぶ `getInfoOfFeatureAt`／`selectSingleFeatureByLatLon` の緯度経度ヒットテストも表示集合に絞る（1票はこの部分を上限撤廃などと合わせて方針判断とした） |
| V-L7 | ネイティブ 3D で選択中のポイントが黄色にならず、データ順で重ねるので近くの点の下に隠れる。selected で変わるのは枠色（黒）だけで、2D（黄色＋zIndex 1000）・Web（黄色）と食い違う。選択判定は record.id だけで layerId を比べていないので、別レイヤに同じ id があると両方が選択扱いになり得る | 安全 | `HomeTerrain3DPoints.tsx:61-72, 93-98, 151-160`、`HomePoint.tsx:162-163, 199`、`HomePoint.web.tsx:162-164` | selected なら color を `COLOR.YELLOW` にし、選択点を配列末尾へ回して最前面に描く。判定は layerId と record.id の両方で行う。300 件の打ち切りで選択点が漏れないよう優先して含める |
| V-L8 | Web で眺望中に長押しから別地点の「ここからの眺望」を選ぶと、眺望前の画角が眺望中の画角（60°、望遠なら 8° など）で上書きされ、バナーで抜けた後の通常 3D がその画角のまま残る（再読み込みまで）。`startWebVista` は既存 vista があっても `previousFovDeg = map.getVerticalFieldOfView()` を読み直す（289 行）。眺望中も長押しタイマーは有効で、`HomePoiPopup` は 3D なら startWebVista を直接呼ぶ。加えて足元標高を待つ間（最大 5 秒）も古い眺望の onIdle と見回しが生きていて（detach は待った後）、新地点への jumpTo を戻し乗り換えが遅れることがある | 安全 | `webVista.ts:241-250, 275-307, 357-381`、`HomePoiPopup.tsx:158-162`、`containers/Home.tsx:2953-2979` | `const previousFovDeg = vista?.previousFovDeg ?? map.getVerticalFieldOfView()`。標高を待つ前（jumpTo の前）に古い vista の `detach()` を呼ぶ（vista 自体は null にしない） |
| V-L9 | Web の眺望の目の高さが地形の誇張（1.5 倍）にそろっておらず、同じ高さ設定でもネイティブより低い視点になる。Web は ground が誇張込み（queryTerrainElevation、フォールバックも ×誇張）なのに `eyeAltitude = ground + heightM` で heightM を誇張せずに足す。ネイティブは素の標高 `ground + heightM` に描画時 elevScale を掛けるので、実世界の地上 heightM に相当する。1000m 設定で Web は実高約 667m 相当になり、尾根の向こうの見え方と出る山名（`isSightBlocked` も同じ目の高さ）が食い違う。既定 1.7m では差は 1m 未満。3票中1票は medium | 判断 | `webVista.ts:63-64, 104, 196-211, 411-416`、`TerrainScene.ts:575-578, 623, 817-828`、`coords.ts:111-112` | `eyeAltitude = ground + heightM * TERRAIN_EXAGGERATION` にしてネイティブ（実世界の地上高）にそろえる。lookTarget・applyCamera・projectPeak はこの関数を通るので1か所で済む。どちらの意味を正とするかは方針判断 |
| V-L10 | Web で GEBCO 海底地形図を表示中、海上で眺望すると目が海底近くに沈む。bathyterrain プロトコルが海面下を GEBCO の深さ×3（さらに地形誇張 1.5）の負の標高で返し、`queryGround` は負値をそのまま返す。startWebVista・onIdle でそのまま ground にするので、目は海底の 1.7m 上になり、周りが海底の斜面で塞がれ陸や山名がほとんど出ない。ネイティブは `Math.max(0, ground)` で海面に立たせている（メモリ gebco-3d-bathymetry の仕様）。GEBCO を表示していなければ海は 0m なので起きない | 安全 | `webVista.ts:197-212, 245-248, 291-296`、`gebcoDemLayers.web.ts:230-260`、`Home.web.tsx:615-625`、`TerrainScene.ts:578, 603, 701, 1526-1528` | `queryGround` の戻り値（と waitForGround のフォールバック）を `Math.max(0, …)` にする。onIdle の差分判定も下限処理後の値で比べる（ネイティブ 1527 行と同じ形） |

---

## 反証されたもの

| 候補 | 反証の理由 |
|---|---|
| なし | 候補はすべて多数決で実在と判定した。V-L1 の「描画が固まる」部分だけは1票が否定している（本文に記載） |

---

## 直す順番の提案

1. **操作が効かない・止められない（安全に直せる）**: V-M1（ヘディングアップの空振り。1 行の条件変更と null チェックで済み、TypeError も消える）、V-M6（遠方のタップ・長押し）、V-M7（3D→2D の位置・ズーム同期）。
2. **表示の誤り（安全に直せる）**: V-M4（作り直し・撮り直しの世代を全リングに。まず合計世代だけ入れ、(A)(B) の hadCoarse は続けて）、V-M5（眺望中の浮かせ量）、V-M9（Web の足元標高待ち）、V-L10（Web の海上眺望。V-M9 と同じ queryGround を触るので一緒に）。
3. **小さな安全修正**: V-L2（tween の取り消し）、V-L8（Web の画角引き継ぎ）、V-L5（Web マーカーの背後判定の共通化）、V-L6・V-L7（3D ポイントのピックと選択表示。同じファイル）、V-L1（デバイスロスト時の configure と初期視点）。
4. **方針を決めてから直すもの**: V-M2（地中カメラ。持ち上げるかピッチを浅くするか）、V-M8 と V-L3（眺望から抜ける・ジャンプするときの戻り先とズーム。同じ「眺望中の外部カメラ移動」の扱いなのでまとめて決める）、V-L9（Web の目の高さの意味）、V-L4（緯度による強調倍率）。
5. **描画の作り直しが要るもの**: V-M3（遠景リングの山を透けるドレープ）。性能を測りながら進める。

## 修正状況（2026-11-23、fix/remaining-audits）

【安全】の項目はすべて直した（V-M1、V-M4、V-M5〜V-M7、V-M9、V-L1、V-L2、V-L5〜V-L8、V-L10）。次の部分は挙動が変わるので判断待ちとした。
- V-M4 (A)(B): 粗いリング・旧ズームで取った値を作り直す（作り直しの回数が増える）
- V-L5: 地形に隠れた点まで消す
- V-L6: 3D の緯度経度のヒットテストを表示中の点に絞る
【判断】の項目（V-M2、V-M3、V-M8、V-L3、V-L4、V-L9）は未着手。

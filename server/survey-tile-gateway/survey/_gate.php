<?php
// 署名付きタイル配信ゲートウェイ。
// URLの ?expires=..&sig=.. をHMAC-SHA256で検証し、通れば実体を返す。
// 実体は ../survey_tiles/ に置く（そちらの .htaccess で直アクセスを拒否している）。
// 署名の発行はFirebase Functions側（同じ秘密鍵をSecret Managerに登録する）。
//
// サーバーのPHPは5.6系のため、PHP7構文（?? / declare(strict_types) / スカラー型宣言）は使えない。

// 有効期限の上限。長すぎる署名を弾く保険。
// Functions側(tile-func.ts)の SIGNATURE_TTL_SEC は90日。ここはサーバー間の時計ずれで
// 誤って400にならないよう1日分の余裕を足した91日にしている。
define('TTL_MAX', 7862400);

$ROOT   = dirname(__FILE__) . '/../survey_tiles';
$SECRET = @include $ROOT . '/tile_secret.php';

function pick($arr, $key, $default) {
    return isset($arr[$key]) ? $arr[$key] : $default;
}

// Web版のmaplibre/pmtilesはクロスオリジンでRangeを投げる
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Range');
header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');
if (pick($_SERVER, 'REQUEST_METHOD', '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// 鍵が読めない場合は開放せず落とす（fail-closed）
if (!is_string($SECRET) || $SECRET === '') {
    error_log('tile gate: tile_secret.php を読み込めません');
    http_response_code(500);
    exit;
}

$layer   = (string)pick($_GET, 'layer', '');
$expires = (int)pick($_GET, 'expires', 0);
$sig     = (string)pick($_GET, 'sig', '');
// 単一ファイル系は拡張子、空ならz/x/yタイル
$file    = (string)pick($_GET, 'file', '');

// レイヤ名は日本語も許すが、パス区切り・制御文字・.. ・先頭ドットは禁止
if (
    $layer === '' || strlen($layer) > 128
    || preg_match('#[/\\\\\x00-\x1f]#', $layer) === 1
    || strpos($layer, '..') !== false
    || substr($layer, 0, 1) === '.'
) {
    http_response_code(400);
    exit;
}

// 署名そのものが無い場合は「期限切れ」ではなく拒否として返す
if ($sig === '') { http_response_code(403); exit; }

$now = time();
if ($expires <= $now) { http_response_code(410); exit; }
if ($expires - $now > TTL_MAX) { http_response_code(400); exit; }

$expected = rtrim(strtr(base64_encode(
    hash_hmac('sha256', $expires . ':' . $layer, $SECRET, true)
), '+/', '-_'), '=');
if (!hash_equals($expected, $sig)) { http_response_code(403); exit; }

if ($file !== '') {
    // pmtiles/json/pdf。いずれも「拡張子を除いたファイル名」がレイヤ名になる
    $fileTypes = array(
        'pmtiles' => 'application/octet-stream',
        'json'    => 'application/json',
        'pdf'     => 'application/pdf',
    );
    if (!isset($fileTypes[$file])) { http_response_code(400); exit; }
    $path = $ROOT . '/' . $layer . '.' . $file;
    $type = $fileTypes[$file];
} else {
    $zxy = array();
    foreach (array('z', 'x', 'y') as $k) {
        $v = (string)pick($_GET, $k, '');
        if (!ctype_digit($v)) { http_response_code(400); exit; }
        $zxy[$k] = $v;
    }
    $types = array('png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp');
    $ext = (string)pick($_GET, 'ext', 'png');
    if (!isset($types[$ext])) { http_response_code(400); exit; }
    $type = $types[$ext];
    $path = $ROOT . '/' . $layer . '/' . $zxy['z'] . '/' . $zxy['x'] . '/' . $zxy['y'] . '.' . $ext;
}

// 多重防御。$ROOT の外に出ていないことを実パスで確認する
$real = realpath($path);
$base = realpath($ROOT);
if ($real === false || $base === false || strpos($real, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($real)) {
    http_response_code(404);
    exit;
}

$size = filesize($real);
$etag = sprintf('"%x-%x"', filemtime($real), $size);

header('Content-Type: ' . $type);
header('Accept-Ranges: bytes');
header('Cache-Control: private, max-age=604800');
header('ETag: ' . $etag);

$range   = trim((string)pick($_SERVER, 'HTTP_RANGE', ''));
$start   = 0;
$end     = $size - 1;
$partial = false;

if ($range !== '') {
    // PMTilesは bytes=start-end 形式しか投げないが、suffix形式も一応受ける
    if (preg_match('/^bytes=(\d*)-(\d*)$/', $range, $m) !== 1 || ($m[1] === '' && $m[2] === '')) {
        header('Content-Range: bytes */' . $size);
        http_response_code(416);
        exit;
    }
    if ($m[1] === '') {
        $start = max(0, $size - (int)$m[2]);
    } else {
        $start = (int)$m[1];
        if ($m[2] !== '') { $end = min((int)$m[2], $size - 1); }
    }
    if ($start > $end || $start >= $size) {
        header('Content-Range: bytes */' . $size);
        http_response_code(416);
        exit;
    }
    $partial = true;
} elseif (pick($_SERVER, 'HTTP_IF_NONE_MATCH', '') === $etag) {
    http_response_code(304);
    exit;
}

if ($partial) {
    http_response_code(206);
    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
}
$length = $end - $start + 1;
header('Content-Length: ' . $length);

if (pick($_SERVER, 'REQUEST_METHOD', '') === 'HEAD') { exit; }

// 数GBのPMTilesをメモリに載せないよう、出力バッファを切って逐次送出する
while (ob_get_level() > 0) { ob_end_clean(); }
@set_time_limit(0);

$fp = fopen($real, 'rb');
if ($fp === false) { http_response_code(500); exit; }
fseek($fp, $start);
$remain = $length;
while ($remain > 0 && !feof($fp) && !connection_aborted()) {
    $chunk = fread($fp, (int)min(262144, $remain));
    if ($chunk === false || $chunk === '') { break; }
    echo $chunk;
    $remain -= strlen($chunk);
    flush();
}
fclose($fp);

#!/bin/bash
# 開発サーバー(WebARENA)へWeb版をFTPSでアップロードする。
#
#   yarn deploy:dev              ビルドしてアップロード
#   bash scripts/deploy-dev-ftp.sh --dry-run   転送内容の確認のみ
#   bash scripts/deploy-dev-ftp.sh --delete    ローカルに無いファイルをサーバーから削除
#
# パスワードはmacOSのキーチェーンから取得する。初回のみ下記で登録すること:
#   security add-generic-password -a admin -s ecorismap-ftp -U -w
# ※ -w は必ず最後に置く。後ろに別のオプションが続くと、それがパスワードとして登録される。
#
# 平文FTPにフォールバックしないよう ftp:ssl-force を有効にしている。
set -euo pipefail

HOST="${ECORISMAP_FTP_HOST:-ecoris.co.jp}"
FTP_USER="${ECORISMAP_FTP_USER:-admin}"
# 公開URL https://www.ecoris.co.jp/pukiwiki/map/ecorismap/ に対応するサーバー上のパス
REMOTE_DIR="${ECORISMAP_FTP_PATH:-/ssl/home/pukiwiki/map/ecorismap/}"
KEYCHAIN_SERVICE="${ECORISMAP_FTP_KEYCHAIN:-ecorismap-ftp}"
LOCAL_DIR="${ECORISMAP_WEB_BUILD:-web-build}"

DRY_RUN=""
DELETE=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="--dry-run" ;;
    --delete) DELETE="--delete" ;;
    *) echo "不明なオプション: $arg" >&2; exit 1 ;;
  esac
done

command -v lftp >/dev/null || { echo "lftpがありません。brew install lftp を実行してください。" >&2; exit 1; }

if [ ! -f "$LOCAL_DIR/index.html" ]; then
  echo "$LOCAL_DIR/index.html がありません。先に yarn build:web を実行してください。" >&2
  exit 1
fi

# パスワードはキーチェーンから読む。引数に渡すとpsで見えるためlftpの標準入力経由で渡す。
if ! FTP_PASS=$(security find-generic-password -a "$FTP_USER" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null); then
  cat >&2 <<MSG
キーチェーンにパスワードが登録されていません。次のコマンドで登録してください（対話入力）。

  security add-generic-password -a $FTP_USER -s $KEYCHAIN_SERVICE -U -w

（-w は必ず最後に置くこと。後ろにオプションが続くとそれがパスワードとして登録される）
MSG
  exit 1
fi

echo "アップロード先 : ftps://$FTP_USER@$HOST$REMOTE_DIR"
echo "ローカル       : $LOCAL_DIR/ ($(du -sh "$LOCAL_DIR" | cut -f1))"
[ -n "$DRY_RUN" ] && echo "モード         : ドライラン（実際には転送しません）"
[ -n "$DELETE" ] && echo "モード         : --delete 有効（サーバー側の余分なファイルを削除します）"
echo

# lftpは--dry-runで「実行するはずのコマンド」をそのまま出力し、そこに認証情報付きURLが
# 含まれる。出力は必ずマスクしてから表示する。
mask() { FTP_PASS="$FTP_PASS" python3 -c '
import sys, os
pw = os.environ["FTP_PASS"]
for line in sys.stdin:
    sys.stdout.write(line.replace(pw, "********"))
    sys.stdout.flush()
'; }

# mirror -R = ローカル→サーバー方向。--only-newer で差分のみ転送する。
# lcd/cd で両側の位置を合わせ、"." を指定することで web-build という階層を作らない。
# --no-perms: サーバー側は admin:web の 640 で運用されており、Webサーバーはグループ経由で
# 読んでいる。lftp既定の chmod 644 を当てると不要な other 読み取りを与えるため無効化する。
# アクセス制限は親ディレクトリの .htaccess で行われている（このディレクトリには無い）。
lftp <<LFTP 2>&1 | mask
set ftp:ssl-force true
set ftp:ssl-protect-data true
set ssl:verify-certificate no
set net:max-retries 2
set net:timeout 20
open "$HOST"
user "$FTP_USER" "$FTP_PASS"
lcd "$LOCAL_DIR"
cd "$REMOTE_DIR"
mirror -R --only-newer --parallel=4 --no-perms $DRY_RUN $DELETE . .
bye
LFTP

echo
echo "完了しました。"

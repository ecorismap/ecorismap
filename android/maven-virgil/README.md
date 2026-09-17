# maven-virgil — 16KBページ対応のVirgilネイティブライブラリ

Play Consoleの「16 KBデバイスでアプリがクラッシュする可能性がある」警告への対応。
Maven Central配布の`foundation-android:0.13.1` / `pythia-android:0.13.1`に含まれる
`libvscf_foundation.so` / `libvscp_pythia.so`はNDK r19c（2019年）ビルドのため、
同じv0.13.1ソースから**NDK r28c**でリビルドした.so（arm64-v8a / armeabi-v7a）に
差し替えたAARをバージョン`0.13.1-16kb`としてここに置いている。

- Javaラッパー・JNIシンボル（880個）は元のAARと完全一致を確認済み（ドロップイン互換）
- x86 / x86_64のjniライブラリは旧バイナリのまま（アプリはpackagingOptionsで除外済み）
- 解決は`android/build.gradle`の`dependencySubstitution`で強制

## リビルド手順（2026-09-17実施）

1. `tmizu23/virgil-crypto-c`（フォーク）の`v0.13.1`タグをチェックアウト
2. 新しいツールチェーン向けパッチ2件を適用（フォークのブランチ参照）:
   - `thirdparty/relic/CMakeLists.txt`: blake2.hの`ALIGNME(64)`除去（新clangはaligned packed構造体の配列を拒否。参照実装なので正しさに影響なし）
   - `thirdparty/nanopb/CMakeLists.txt`: nanopb_generator.pyの`open(..., "rU")`→`"r"`（Python 3.11+で廃止）
3. 必要ツール: NDK r28c、Android SDK同梱cmake 3.22、`python`シム＋`pip install protobuf`（protoc-gen-nanopb用）、Homebrew protoc
4. Jenkinsfileのレシピどおりビルド（ABIごとに）:
   ```sh
   cmake -Cconfigs/java-config.cmake -DCMAKE_BUILD_TYPE=Release \
     -DTRANSITIVE_C_FLAGS="-fvisibility=hidden" -DANDROID_ABI=<abi> \
     -DANDROID_PLATFORM=android-21 \
     -DCMAKE_TOOLCHAIN_FILE=$NDK/build/cmake/android.toolchain.cmake \
     -DCMAKE_INSTALL_PREFIX=wrappers/java/binaries/android \
     -DCMAKE_INSTALL_LIBDIR=lib/<abi> -DENABLE_CLANGFORMAT=OFF -Bbuild-<abi> -H.
   cmake --build build-<abi> --target install -- -j10
   ```
5. `libvsc*_java.so`を`llvm-strip --strip-unneeded`し、`_java`を外した名前で
   元のAARの`jni/<abi>/`エントリを`zip`で上書き、POMのversionを`0.13.1-16kb`に変更

## 検証方法

```sh
llvm-readelf -p .note.android.ident jni/arm64-v8a/libvscf_foundation.so  # → r28c
llvm-readelf -l jni/arm64-v8a/libvscf_foundation.so | grep LOAD          # → align 0x4000
```

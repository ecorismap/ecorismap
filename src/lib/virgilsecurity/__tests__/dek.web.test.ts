import { TextDecoder as NodeTextDecoder } from 'util';

// jest-expoはTextDecoderをExpo版に差し替えるが、virgil-cryptoのwasm初期化はutf-16leを要求するためNode標準に戻す
global.TextDecoder = NodeTextDecoder as unknown as typeof global.TextDecoder;

import { createProjectDEK, isDEKKeyPair } from '../dek.web';

describe('isDEKKeyPair (DEK秘密鍵とプロジェクト公開鍵の照合)', () => {
  it('対になっている鍵ペアは一致と判定する', async () => {
    const dek = await createProjectDEK();
    expect(await isDEKKeyPair(dek.privateKey, dek.publicKey)).toBe(true);
  });

  it('別の鍵ペアの秘密鍵（偽のDEK）は不一致と判定する', async () => {
    const real = await createProjectDEK();
    const forged = await createProjectDEK();
    expect(await isDEKKeyPair(forged.privateKey, real.publicKey)).toBe(false);
  });

  it('壊れた値は例外を投げず不一致と判定する', async () => {
    const real = await createProjectDEK();
    expect(await isDEKKeyPair('AAAA', real.publicKey)).toBe(false);
    expect(await isDEKKeyPair(real.privateKey, 'not-base64!!')).toBe(false);
  });
});

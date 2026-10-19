// scripts/generate-keys.ts
// Запуск: npx tsx scripts/generate-keys.ts
// Создаёт private.pem и public.pem в scripts/keys/

import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const KEYS_DIR = join(process.cwd(), 'scripts', 'keys');
mkdirSync(KEYS_DIR, { recursive: true });

const { publicKey, privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true
});

const privatePem = await exportPKCS8(privateKey);
const publicPem = await exportSPKI(publicKey);

writeFileSync(join(KEYS_DIR, 'private.pem'), privatePem);
writeFileSync(join(KEYS_DIR, 'public.pem'), publicPem);

console.log('✅ Ключи созданы:');
console.log('   scripts/keys/private.pem — НИКОМУ НЕ ПОКАЗЫВАТЬ');
console.log('   scripts/keys/public.pem  — загрузить в Supabase Dashboard');
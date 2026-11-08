import { randomBytes } from 'node:crypto';
import { passwordHash } from '../netlify/functions/core.mjs';
import { createInterface } from 'node:readline/promises';

const terminal = createInterface({ input: process.stdin, output: process.stdout });
const password = await terminal.question('Nova senha do administrador (mínimo de 16 caracteres): ');
terminal.close();
if (password.length < 16) {
  console.error('Use uma senha com pelo menos 16 caracteres.');
  process.exit(1);
}
console.log('\nADMIN_PASSWORD_HASH=' + passwordHash(password, randomBytes(16).toString('hex')));
console.log('SESSION_SECRET=' + randomBytes(48).toString('hex'));
console.log('\nCopie os valores para .env (local) e para variáveis da Netlify.');

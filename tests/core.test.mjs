import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  hideSecrets, hasValidSecretPairs, publicCodex, publicListing, validateCodex,
  passwordHash, verifyPassword, signSession, verifySession,
} from '../netlify/functions/core.mjs';
import { initialCodices } from '../netlify/functions/seed.mjs';

test('the initial codex contains the three requested locations', () => {
  assert.deepEqual(initialCodices.map(entry => entry.title), ['Avalon', 'Bolívar', 'Columbia']);
  assert.equal(initialCodices[0].content.general.startsWith('Escondida entre extensas florestas'), true);
  assert.equal(initialCodices[1].content.professional.includes('No centro dessa guerra existe uma cidade'), true);
  assert.equal(initialCodices[2].content.professional.includes('Columbia também utiliza dinheiro'), true);
  const counts = initialCodices.map(entry => Object.values(entry.content).join('\n\n').split('\n\n').length);
  assert.deepEqual(counts, [8, 12, 12]);
});

test('public readers do not receive restricted content', () => {
  const doc = initialCodices[0];
  const result = publicCodex(doc);
  assert.ok(result.content.general.includes('Reino dos Espíritos'));
  assert.equal(result.content.specific, null);
  assert.equal(result.content.professional, null);
  assert.equal(JSON.stringify(result).includes('Rainha Muse'), false);
  assert.deepEqual(publicCodex(doc, true), doc);
});

test('visibility levels unlock each section independently', () => {
  const doc = { ...initialCodices[0], publicLevel: 1 };
  const result = publicCodex(doc);
  assert.equal(typeof result.content.specific, 'string');
  assert.equal(result.content.professional, null);
});

test('inline secrets are removed before public delivery', () => {
  const doc = structuredClone(initialCodices[0]);
  doc.content.general = 'Começo {{secret}}NÃO ENVIAR{{/secret}} final';
  const publicVersion = publicCodex(doc);
  assert.equal(publicVersion.content.general, 'Começo ??? final');
  assert.equal(JSON.stringify(publicVersion).includes('NÃO ENVIAR'), false);
  assert.equal(hideSecrets('Início {{secret}}sem fim'), 'Início ???');
  assert.equal(hasValidSecretPairs('ok {{secret}}text{{/secret}}'), true);
  assert.equal(hasValidSecretPairs('bad {{secret}}'), false);
  assert.equal(hasValidSecretPairs('bad {{secret}}nested {{secret}}x{{/secret}}'), false);
});

test('listing does not contain document paragraphs', () => {
  const list = publicListing(initialCodices[2]);
  assert.equal('content' in list, false);
});

test('codex validation rejects unsafe content and slugs', () => {
  const doc = structuredClone(initialCodices[0]);
  assert.equal(validateCodex(doc).slug, 'avalon');
  assert.throws(() => validateCodex({ ...doc, slug: '../admin' }));
  assert.throws(() => validateCodex({ ...doc, publicLevel: 5 }));
  assert.throws(() => validateCodex({ ...doc, content: { ...doc.content, general: '{{secret}}broken' } }));
});

test('password and session signatures verify securely', () => {
  const encoded = passwordHash('a-long-password-example', randomBytes(16).toString('hex'));
  assert.equal(verifyPassword('a-long-password-example', encoded), true);
  assert.equal(verifyPassword('different-password', encoded), false);
  const secret = randomBytes(48).toString('hex');
  const issued = signSession(secret, Date.UTC(2026, 10, 8));
  assert.equal(verifySession(issued, secret, Date.UTC(2026, 10, 8) + 1000), true);
  assert.equal(verifySession(issued, 'other-secret'.repeat(8), Date.UTC(2026, 10, 8)), false);
  assert.equal(verifySession(issued, secret, Date.UTC(2026, 10, 9)), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { importActor, applyCharacterSettings, displayCharacter } from '../netlify/functions/character-core.mjs';

const sample = {
  name: 'Exemplo', type: 'character',
  system: {
    level: { value: 6 },
    attributes: { dex: { base: 8 }, ins: { base: 10 }, mig: { base: 6 }, wlp: { base: 10 } },
    affinities: { fire: { base: -1 }, ice: { base: 1 } },
    resources: { hp: { value: 36, bonus: 0 }, mp: { value: 71, bonus: 0 }, ip: { value: 6, bonus: 0 },
      identity: { name: 'Estudante' }, origin: { name: 'Avalon' }, theme: { name: 'Busca' } },
  },
  items: [
    { type: 'class', name: 'Elementalista', system: { fuid: 'elementalist', benefits: { resources: { mp: { value: true } } } } },
    { type: 'class', name: 'Erudito', system: { fuid: 'loremaster', benefits: { resources: { mp: { value: true } } } } },
    { type: 'class', name: 'Espiritualista', system: { fuid: 'spiritist', benefits: { resources: { mp: { value: true } } } } },
    { type: 'skill', name: 'Magia Elemental', system: { level: { value: 2 }, class: { value: 'elementalist' }, description: '<p>Poder <strong>elemental</strong>.</p>' } },
    { type: 'optionalFeature', name: 'Sobrevivente', system: { fuid: 'peculiaridade', data: { description: '<p>Aumente seus PV e PM máximos em 5.</p>' } } },
  ],
};
test('normalizes Project FU actor resources, classes, skills, and peculiarities', () => {
  const profile = importActor(sample);
  assert.equal(profile.slug, 'exemplo');
  assert.deepEqual([profile.resources.hp.max, profile.resources.mp.max, profile.resources.ip.max], [41, 76, 6]);
  assert.equal(profile.skills[0].description, 'Poder elemental.');
  assert.equal(profile.classes[0].level, 2);
  assert.equal(profile.peculiarities[0].name, 'Sobrevivente');
  assert.equal(profile.affinities.fire.value, -1);
  assert.equal(profile.affinities.ice.value, 1);
});
test('requires valid character actor', () => {
  assert.throws(() => importActor({ ...sample, type: 'npc' }));
  assert.throws(() => importActor({ ...sample, items: null }));
});
test('only accepts Git-tracked assets and optional numeric maximum overrides', () => {
  const profile = importActor(sample);
  const modified = applyCharacterSettings(profile, { sprite: '/assets/sprites/test.png', maxOverrides: { hp: 100, mp: null, ip: null } });
  assert.equal(displayCharacter(modified).resources.hp.max, 100);
  assert.equal(displayCharacter(modified).resources.mp.max, 76);
  assert.throws(() => applyCharacterSettings(profile, { sprite: 'https://other.site/test.png' }));
});

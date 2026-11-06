import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSlashCapabilities } from '../../public/slash-search.js';

test('short slash queries prefer capability names over common description letters', () => {
  const capabilities = [
    ...Array.from({ length: 12 }, (_, index) => ({
      name: `skill-${index}`,
      description: 'When the user wants to plan an experiment',
    })),
    { name: 'requirements-analysis', description: 'Use for requirements analysis' },
  ];

  assert.deepEqual(
    filterSlashCapabilities(capabilities, 'r').map(({ name }) => name),
    ['requirements-analysis'],
  );
});

test('longer slash queries include name matches before description matches', () => {
  const capabilities = [
    { name: 'test-strategy', description: 'Plan tests' },
    { name: 'test-case-writing', description: 'Write executable cases' },
    { name: 'review-helper', description: 'Supports test plan reviews' },
  ];

  assert.deepEqual(
    filterSlashCapabilities(capabilities, 'test').map(({ name }) => name),
    ['test-strategy', 'test-case-writing', 'review-helper'],
  );
});

test('slash suggestion count remains capped', () => {
  const capabilities = Array.from({ length: 12 }, (_, index) => ({
    name: `skill-${index}`,
    description: 'utility',
  }));

  assert.equal(filterSlashCapabilities(capabilities, '').length, 9);
});

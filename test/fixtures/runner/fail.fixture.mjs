import test from 'node:test';
test('runner fixture fails', () => { throw new Error('fixture failure'); });

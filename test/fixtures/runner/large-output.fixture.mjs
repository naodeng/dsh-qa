import test from 'node:test';
test('runner fixture emits bounded output', () => { process.stdout.write('x'.repeat(1024 * 1024 + 100)); });

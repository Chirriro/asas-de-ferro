import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watchAssetIndex } from './assets-index.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stopWatching = await watchAssetIndex();
const executable = path.join(project, 'node_modules', '.bin', 'netlify');
const server = spawn(executable, ['dev', '--port', '8888'], { cwd: project, stdio: 'inherit' });
function shutdown() {
  stopWatching();
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.on('error', error => { console.error(error); shutdown(); process.exitCode = 1; });
server.on('exit', (code, signal) => { stopWatching(); process.exit(code || (signal ? 1 : 0)); });

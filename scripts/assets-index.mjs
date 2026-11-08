import { promises as fs, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets');
const extensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.ico']);

function encodeUrl(relative) {
  return '/assets/' + relative.split('/').map(encodeURIComponent).join('/');
}

export async function buildAssetIndex() {
  await fs.mkdir(root, { recursive: true });
  const files = [];
  const folders = new Set(['']);
  async function walk(folder, relative = '') {
    for (const item of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name.startsWith('.') || item.name === 'library.json') continue;
      const fullPath = path.join(folder, item.name);
      const relativePath = [relative, item.name].filter(Boolean).join('/');
      if (item.isDirectory()) {
        folders.add(relativePath);
        await walk(fullPath, relativePath);
      } else if (item.isFile() && extensions.has(path.extname(item.name).toLowerCase())) {
        const stat = await fs.stat(fullPath);
        files.push({ name: item.name, folder: relative, url: encodeUrl(relativePath), bytes: stat.size });
      }
    }
  }
  await walk(root);
  const manifest = { folders: [...folders].sort((a, b) => a.localeCompare(b)), files };
  const output = path.join(root, 'library.json');
  const text = JSON.stringify(manifest, null, 2) + '\n';
  const previous = await fs.readFile(output, 'utf8').catch(() => '');
  if (previous !== text) {
    await fs.writeFile(output, text);
    console.log(`[assets] ${files.length} image(s) indexed across ${folders.size} folder(s)`);
  }
  return manifest;
}

export async function watchAssetIndex() {
  await buildAssetIndex();
  let timer;
  let watcher;
  try {
    watcher = watch(root, { recursive: true }, (event, filename) => {
      if (filename?.toString().endsWith('library.json')) return;
      clearTimeout(timer);
      timer = setTimeout(() => buildAssetIndex().catch(console.error), 250);
    });
  } catch (error) {
    console.warn('[assets] File watching not supported, rescanning every 3 seconds.');
    timer = setInterval(() => buildAssetIndex().catch(console.error), 3000);
  }
  return () => { clearTimeout(timer); clearInterval(timer); watcher?.close(); };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildAssetIndex();
}

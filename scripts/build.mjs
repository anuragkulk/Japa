import './check-node.mjs';
// Set this before importing Vite: the desktop terminal can inherit development mode.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build({ mode: 'production' });

// The host only serves its SPA fallback to requests that accept HTML, so these
// public pages are also emitted as real files. The app reads the URL path and
// renders the same React screen; assets are root-absolute, so one index.html
// works from any path.
const PUBLIC_PAGES = [
  ['privacy-policy', 'Japa Privacy Policy'],
  ['delete-account', 'Delete your Japa account'],
  ['delete-data', 'Delete your Japa data'],
];

const { mkdir, writeFile, readFile } = await import('node:fs/promises');
const html = await readFile('dist/index.html', 'utf8');
for (const [path, title] of PUBLIC_PAGES) {
  const pageHtml = html.replace('<title>Japa</title>', `<title>${title}</title>`);
  await mkdir(`dist/${path}`, { recursive: true });
  await writeFile(`dist/${path}/index.html`, pageHtml);
  await writeFile(`dist/${path}.html`, pageHtml);
}
console.log(`public pages emitted: ${PUBLIC_PAGES.map(([p]) => '/' + p).join(', ')}`);

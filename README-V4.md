# Asas de Ferro — V4 patch (desktop only)

These files **update an existing V3 project**. They are not a complete new project. Copy their relative paths into your repository and allow replacements. **Do not delete** `netlify/functions/seed.mjs`, your existing `.env`, other scripts, or your existing Códice data.

## Changed files

- `public/app.js` — continuous 23-line menu waves, fades, dark Códice adjustments, banners, subentries, asset browser
- `public/styles.css` — fixed selector star, compact reading UI, transparent panels, lightbox, image browser, hidden scrollbars
- `netlify/functions/core.mjs` — validates banner and optional parent slug; hides those for fully locked entries
- `netlify/functions/api.mjs` — supports subentry hierarchy, cycle prevention, protected deletion, masked-parent navigation
- `netlify/functions/site.mjs` — static asset paths in site settings while still allowing existing V3 image references
- `netlify/functions/page.mjs` — resolves social preview and favicon URLs for Git-tracked assets
- `netlify.toml` — runs the asset indexing build step on Netlify
- `package.json` — adds asset scanner, asset watcher, and local dev wrapper

## New files

- `scripts/assets-index.mjs` — scans nested folders and generates `public/assets/library.json`
- `scripts/dev.mjs` — starts Netlify Dev and watches asset folders
- `public/assets/library.json` — initially empty asset catalog; automatically regenerated
- `tests/v4.unit.test.mjs` — small standalone validation tests

## How to use the asset library

Put image files inside **`public/assets/`**, organized however you want, for example:

```text
public/assets/
  logos/asas-de-ferro.png
  backgrounds/menu/background.webp
  backgrounds/codice/background.jpg
  locations/avalon/banner.webp
  locations/bolivar/banner.webp
  icons/favicon.png
  social/preview.webp
```

Use PNG, JPEG, WebP, GIF, AVIF, SVG, or ICO. Use images you have permission to publish. Be mindful that all these files are **public** and included in your Git repository. Do not put confidential or unrevealed lore images there.

Run:

```bash
npm install
npm run dev
```

When Zed adds or removes images, the local asset index updates automatically. You can also explicitly regenerate it with:

```bash
npm run assets:scan
```

In **Administração → Identidade do site**, click **BIBLIOTECA**, choose a folder and image, and then click **SALVAR IMAGENS SELECIONADAS**. Under **Administração → Códice → Editar/Novo**, choose a banner through the same **BIBLIOTECA** button. Empty folders and subfolders are shown in the folder list.

New asset files added in Git become available in Netlify when you push to GitHub; the Netlify build automatically regenerates the index. **Choosing an asset in the admin panel saves its path to Netlify Blobs, not to Git.** Consequently, if you choose something on localhost, repeat the choice on the published site (local and production Blobs settings are separate). Existing V3 uploads remain stored in Blobs but are no longer offered as the preferred asset workflow.

## Subentries

A Códice entry has an optional **VERBETE PAI** selector. Select an existing entry to nest the current entry beneath it. Several nesting levels are supported. Entries are linked in a hierarchical sidebar and children are also listed in their parent article. The server rejects circular nesting and prevents deleting a parent until its children are moved or deleted. Older entries remain top-level without migration.

## What's changed visually

- Main menu retains the selection star in place. Selected items display continuously flowing, multi-line light ribbons drawn on a canvas, with no finite animation reset.
- On navigation, the old view fades to dark while the next view loads and then fades back in. Respect `prefers-reduced-motion`.
- The Códice landing article is empty. Page titles and headings use less vertical space.
- All knowledge headings have the same green tint. Unavailable sections display only `???`. No sidebar `AD / 01`.
- Scrollbars are invisible but mouse wheel, touchpad and keyboard scrolling work normally.
- Article banners are optional. Click one to expand it in a closable dialog (Esc supported). Images are not draggable.

Target sizes: 1366×768, 1920×1080, 2560×1080. Mobile is intentionally unsupported.

## Deployment notes

Do not copy `node_modules/`, `.env`, or the PDF references into the public site. This patch does **not** include a new `seed.mjs` or overwrite your lore. Back up your V3 folder before replacing files. When you change `package.json` or `netlify.toml`, restart `npm run dev`. For future frontend CSS/JS changes, refresh the browser normally.

Tests: `npm test` (requires `npm install`).

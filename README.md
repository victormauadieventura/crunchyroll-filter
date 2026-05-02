# Crunchyroll Filter

A local React app for browsing and filtering a Crunchyroll catalog JSON with better controls than the official Crunchyroll interface.

This project lets you filter a locally generated catalog by audio language, subtitle language, dubbing availability, genre, rating, and text search.

---

## Why this project exists

Crunchyroll exposes useful catalog information in its frontend and internal responses, but the official UI does not provide precise enough filters for some use cases.

For example, it can be difficult to filter by combinations such as:

- Portuguese (Brazil) audio
- Portuguese (Brazil) subtitles
- dubbed titles only
- romance titles
- minimum rating
- local text search
- A-Z ordering with richer metadata

This app solves that by using a local JSON catalog extracted from Crunchyroll and displaying it in a custom React interface.

---

## Features

- Load a local Crunchyroll catalog JSON automatically
- Upload another JSON manually from the UI
- Filter by Brazilian Portuguese audio
- Filter by Brazilian Portuguese subtitles
- Filter by real dubbed availability
- Filter by Japanese-only audio
- Filter by genre
- Filter by minimum rating
- Search by title, synopsis, audio, subtitles, genres, or content rating
- Sort by title or rating
- Display cover image, title, rating, seasons, episodes, audio, subtitles, genres, and synopsis
- Copy the currently filtered result as JSON
- Includes a browser console extraction script to regenerate the catalog

---

## Project structure

```txt
crunchyroll-filter/
├─ public/
│  ├─ catalogo_crunchyroll_full.json
│  └─ console.js
├─ src/
│  ├─ App.jsx
│  ├─ index.css
│  └─ main.jsx
├─ package.json
├─ vite.config.js
└─ README.md
```

---

## Important files

### `public/catalogo_crunchyroll_full.json`

This is the generated Crunchyroll catalog used by the app.

The app automatically loads it from:

```txt
/catalogo_crunchyroll_full.json
```

So the file must be located here:

```txt
public/catalogo_crunchyroll_full.json
```

You can replace this file at any time with a newer generated catalog.

---

### `public/console.js`

This is the script used to generate or update the catalog from the Crunchyroll website.

It is meant to be pasted into the browser DevTools Console while browsing Crunchyroll.

The script watches the content loaded by the Crunchyroll frontend, collects catalog data, and exposes helper methods on the page:

```js
CR_TOOL.summary()
CR_TOOL.full()
CR_TOOL.ptbr()
CR_TOOL.dubbed()
CR_TOOL.romance()
CR_TOOL.copy()
```

The main generated array is available in:

```js
window.CR_CATALOG
```

---

## Requirements

You need Node.js and npm installed.

Check your versions:

```bash
node -v
npm -v
```

Recommended:

- Node.js 20 or newer
- npm 10 or newer

---

## Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/crunchyroll-filter.git
```

Enter the project folder:

```bash
cd crunchyroll-filter
```

Install dependencies:

```bash
npm install
```

---

## Running locally

Start the development server:

```bash
npm run dev
```

Open the local URL shown by Vite, usually:

```txt
http://localhost:5173/
```

If `public/catalogo_crunchyroll_full.json` exists, the app will load the catalog automatically.

---

## Using the app

After the page opens, you can:

1. Use the loaded catalog from `public/catalogo_crunchyroll_full.json`
2. Or click **Load JSON** / **Carregar JSON** and manually select another JSON file

The dashboard will show total counts and available filters.

---

## Available filters

### Audio

- All audio
- Brazilian Portuguese audio
- Without Brazilian Portuguese audio

### Subtitles

- All subtitles
- Brazilian Portuguese subtitles
- Without Brazilian Portuguese subtitles

### Dubbing

- All titles
- Real dubbed titles
- No dub
- Japanese-only audio

### Other filters

- Genre
- Minimum rating
- Text search
- Sort A-Z
- Sort Z-A
- Highest rating
- Lowest rating

---

## Expected catalog item format

The app supports flexible JSON fields, but a good catalog item looks like this:

```json
{
  "id": "GEXAMPLE123",
  "title": "Example Anime",
  "url": "https://www.crunchyroll.com/pt-br/series/GEXAMPLE123/example-anime",
  "cover": "https://imgsrv.crunchyroll.com/.../catalog/crunchyroll/example.jpg",
  "rating": "4.8",
  "votes": "(10.2K)",
  "seasons": "1 Temporadas",
  "episodes": "12 Episódios",
  "audio": "Japanese, English, Português (Brasil)",
  "subtitles": "Português (Brasil), English, Español (América Latina)",
  "genres": "Romance, Comedy",
  "contentRating": "Conteúdo Sexual",
  "synopsis": "Anime synopsis here...",
  "flags": {
    "dub": true,
    "ptBR": true,
    "subtitlesPTBR": true,
    "romance": true
  }
}
```

The app also accepts arrays for `audio`, `subtitles`, and `genres`.

Example:

```json
{
  "title": "Example Anime",
  "audio": ["Japanese", "Português (Brasil)"],
  "subtitles": ["Português (Brasil)", "English"],
  "genres": ["Romance", "Comedy"]
}
```

---

## How to update the catalog JSON

1. Open Crunchyroll in your browser.
2. Go to the anime listing page you want to scan, for example the A-Z listing.
3. Open DevTools.

```txt
F12
```

4. Go to the **Console** tab.
5. Open this project file:

```txt
public/console.js
```

6. Copy the entire script.
7. Paste it into the Crunchyroll page console.
8. Press Enter.
9. Scroll the Crunchyroll page until all desired items are loaded.
10. Run:

```js
CR_TOOL.summary()
```

11. When the catalog looks good, copy the generated JSON:

```js
CR_TOOL.copy()
```

12. Replace the contents of:

```txt
public/catalogo_crunchyroll_full.json
```

with the copied JSON.

13. Reload the local React app.

---

## Useful console helpers

After running `public/console.js` on Crunchyroll, these helpers are available:

### Show summary

```js
CR_TOOL.summary()
```

### Return the full catalog

```js
CR_TOOL.full()
```

### Return only titles with Brazilian Portuguese audio

```js
CR_TOOL.ptbr()
```

### Return dubbed titles

```js
CR_TOOL.dubbed()
```

### Return romance-related titles

```js
CR_TOOL.romance()
```

### Search captured items by title

```js
CR_TOOL.inspect("Attack on Titan")
```

### Copy the full generated catalog to the clipboard

```js
CR_TOOL.copy()
```

---

## Cover image cleanup

Some Crunchyroll image URLs are captured with low-resolution or blurred parameters, for example:

```txt
quality=85,width=120,height=180,blur=50
```

The React app attempts to improve these image URLs by:

- removing `blur=50`
- increasing `width`
- increasing `height`
- improving `quality`

So a captured URL like:

```txt
https://imgsrv.crunchyroll.com/cdn-cgi/image/fit=contain,format=auto,quality=85,width=120,height=180,blur=50/catalog/crunchyroll/example.png
```

can be displayed as a cleaner cover image in the app.

---

## Development commands

### Start development server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

---

## Tech stack

- React
- Vite
- Tailwind CSS
- JavaScript

---

## Notes

This is a local utility project.

It does not host, download, or redistribute anime episodes or video files.

It only helps organize and filter catalog metadata that is already loaded in the user's browser while using Crunchyroll.

You still need to use Crunchyroll normally to watch content.

---

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Crunchyroll.

Crunchyroll and related names, images, and metadata belong to their respective owners.

Use this project for personal organization and catalog exploration only.
"# crunchyroll-filter" 

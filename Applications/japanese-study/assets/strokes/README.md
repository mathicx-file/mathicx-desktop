# Stroke SVGs

Place local KanjiVG-compatible SVG files here to reduce network dependency.

Kana SVGs can be refreshed from the project root with:

```bash
npm run download:kana-strokes
```

Expected layout:

```text
assets/strokes/
├── kana/
│   ├── 03042.svg
│   └── 03044.svg
└── kanji/
    ├── 065e5.svg
    └── 06708.svg
```

The app tries local files before falling back to the remote KanjiVG repository.
Keep KanjiVG attribution and license notes when adding copied SVG assets.

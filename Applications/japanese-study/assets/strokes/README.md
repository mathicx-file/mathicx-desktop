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

## Bootstrap N5

The `kanji/` directory contains the 10 kanji selected for bootstrap package
`2026.07.13-1`. They were extracted from the official KanjiVG release
`r20250816`; each SVG preserves its original attribution and CC BY-SA 3.0
license header. Source archive and per-file SHA-256 hashes are recorded in the
dictionary package and its coverage report.

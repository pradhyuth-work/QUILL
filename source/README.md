# Quill source

`src/` holds the app as small modules. `python build.py` writes `dist/artifact.html` (local PDF data) and `dist/hosted.html`; `python mkpwa.py` builds the deployable `pwa/` folder from `dist/`.
Tests are in `tests/` (Playwright, Node). They need the generated test PDFs: run `python tests/gen_corpus.py` first (reportlab).
Internal storage keys (`folio:*`, the `folio` database) keep their old names on purpose, so existing readers keep their books.

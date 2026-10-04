# Inter

Bundled so production builds do not fetch fonts from Google. The application
continues to use Inter, served from its own origin through `next/font/local`.

- Source: https://github.com/google/fonts/tree/main/ofl/inter
- File: `Inter[opsz,wght].ttf`, retrieved 2026-10-04
- SHA-256: `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`
- License: SIL Open Font License 1.1, included in `OFL.txt`.

The bundled variable font includes optical-size and weight axes; it replaces the
unversioned build-time Google Fonts response. No external font request is needed
after installation, and font upgrades are explicit source changes.

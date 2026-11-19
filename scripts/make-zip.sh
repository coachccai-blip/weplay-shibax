#!/usr/bin/env bash
# Fabrique le zip à glisser-déposer sur Netlify : le projet complet (sources, configuration,
# verrou des dépendances), sans node_modules ni dossiers générés. netlify.toml est à la racine du zip.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="release/weplay-shibax-netlify.zip"
mkdir -p release
rm -f "$OUT"
git ls-files --cached --others --exclude-standard \
  | grep -v -E '^(release/|\.netlify/|dist/|node_modules/)' \
  | grep -v -F 'Weplay Shibax - Brief fonctionnel.md' \
  | sort \
  | zip -q -X -9 "$OUT" -@
echo "Zip prêt : $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | tail -1

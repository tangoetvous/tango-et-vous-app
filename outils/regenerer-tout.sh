#!/bin/sh
# Régénère TOUTES les pages de preview depuis worker.js.
# À lancer après toute modification d'un email : la règle veut qu'une maquette
# montrée à l'admin corresponde exactement au code (voir CLAUDE.md).
# ⚠️ Les pages preview-sources-*.html restent manuelles : les mettre à jour
# dans le même commit.
cd "$(dirname "$0")/.." || exit 1
for f in outils/generer-preview-*.js; do
  node "$f" || exit 1
done

#!/bin/sh
# Prépare ./config.toml, monté dans l'image MoneyPrinterTurbo.
#   1. ./config.toml existe déjà  -> on le garde tel quel ;
#   2. sinon                      -> config.example.toml du repo officiel.
set -eu
cd "$(dirname "$0")/.."

UPSTREAM_EXAMPLE="https://raw.githubusercontent.com/harry0703/MoneyPrinterTurbo/main/config.example.toml"

if [ -f config.toml ]; then
  echo "config.toml existe déjà : conservé."
  exit 0
fi

echo "config.toml téléchargé depuis le repo officiel MoneyPrinterTurbo"
curl -fsSL "$UPSTREAM_EXAMPLE" -o config.toml

echo "Renseigne maintenant tes clés dans config.toml (jamais versionné)."

#!/bin/sh
# Prépare ./config.toml, monté dans l'image MoneyPrinterTurbo.
#   1. ./config.toml existe déjà          -> on le garde tel quel ;
#   2. ../MoneyPrinterTurbo/config.toml   -> on le reprend (ton ancien setup) ;
#   3. sinon                              -> config.example.toml du repo officiel.
# Dans les cas 2 et 3, [kokoro] base_url est pointé vers le service compose
# `kokoro` s'il vaut encore la valeur par défaut (127.0.0.1 désignerait le conteneur MPT).
set -eu
cd "$(dirname "$0")/.."

UPSTREAM_EXAMPLE="https://raw.githubusercontent.com/harry0703/MoneyPrinterTurbo/main/config.example.toml"
LEGACY="${MPT_DIR:-../MoneyPrinterTurbo}/config.toml"

if [ -f config.toml ]; then
  echo "config.toml existe déjà : conservé."
  exit 0
fi

if [ -f "$LEGACY" ]; then
  echo "config.toml repris depuis $LEGACY"
  cp "$LEGACY" config.toml
else
  echo "config.toml téléchargé depuis le repo officiel MoneyPrinterTurbo"
  curl -fsSL "$UPSTREAM_EXAMPLE" -o config.toml
fi

awk '
  /^\[/ { in_kokoro = ($0 == "[kokoro]") }
  in_kokoro && /^base_url[[:space:]]*=[[:space:]]*"http:\/\/127\.0\.0\.1:8880\/v1"/ {
    print "base_url = \"http://kokoro:8880/v1\""; next
  }
  { print }
' config.toml > config.toml.tmp && mv config.toml.tmp config.toml

echo "Renseigne maintenant tes clés dans config.toml (jamais versionné)."

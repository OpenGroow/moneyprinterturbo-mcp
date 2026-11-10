#!/bin/sh
# Prepares ./config.toml, mounted in the MoneyPrinterTurbo image.
#   1. ./config.toml already exists -> kept as is;
#   2. otherwise                    -> config.example.toml from the official repo.
set -eu
cd "$(dirname "$0")/.."

UPSTREAM_EXAMPLE="https://raw.githubusercontent.com/harry0703/MoneyPrinterTurbo/main/config.example.toml"

if [ -f config.toml ]; then
  echo "config.toml already exists: kept."
  exit 0
fi

echo "config.toml downloaded from the official MoneyPrinterTurbo repo"
curl -fsSL "$UPSTREAM_EXAMPLE" -o config.toml

echo "Now fill in your keys in config.toml (never committed)."

#!/bin/sh
# Builds the zip people download from GitHub Releases: only the files the
# extension needs, inside a social-cleanup/ folder, from committed files only.
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
out="dist/social-cleanup-v$version.zip"
rm -f "$out"
git archive --format=zip --prefix=social-cleanup/ -o "$out" HEAD manifest.json src LICENSE README.md
echo "$out"

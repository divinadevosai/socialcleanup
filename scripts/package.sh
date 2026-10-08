#!/bin/sh
# Builds the release zips from committed files only:
#   dist/social-cleanup-v<version>.zip        for GitHub Releases (unzips to a social-cleanup/ folder)
#   dist/social-cleanup-v<version>-store.zip  for the Chrome Web Store and Edge Add-ons (manifest.json at the top)
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
files="manifest.json src icons LICENSE"
out="dist/social-cleanup-v$version.zip"
store="dist/social-cleanup-v$version-store.zip"
rm -f "$out" "$store"
git archive --format=zip --prefix=social-cleanup/ -o "$out" HEAD $files README.md
git archive --format=zip -o "$store" HEAD $files
echo "$out"
echo "$store"

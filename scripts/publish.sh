#!/usr/bin/env bash
# Publish this reviewed project in a NEW public personal GitHub repository.
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
command -v gh >/dev/null || { echo 'Install GitHub CLI from https://cli.github.com/ first.'; exit 1; }
gh auth status >/dev/null
owner="$(gh api user --jq .login)"
repository="$owner/little-weekends"
if gh repo view "$repository" >/dev/null 2>&1; then
  echo "Repository $repository already exists. Stopping to avoid overwriting it."
  exit 1
fi
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo 'This directory is already inside a Git checkout. Stopping to avoid using the wrong repository.'
  exit 1
fi
python3 -m unittest discover -s tests -v
node --check site/app.js
node tests/frontend.cjs
python3 scripts/validate_feed.py
git init -b main
git add .github .gitignore README.md requirements.txt scripts site tests
git commit -m 'Publish Little Weekends with automatic event collection'
gh repo create "$repository" --public --description 'Free kid-friendly East Bay outings, with daily event collection' --source . --remote origin --push
gh api --method POST "repos/$repository/pages" -f build_type=workflow >/dev/null
gh workflow run update-and-deploy.yml --repo "$repository" --ref main
printf 'Started publishing https://%s.github.io/little-weekends/\n' "$owner"
printf 'Watch deployment: gh run list --repo %s\n' "$repository"

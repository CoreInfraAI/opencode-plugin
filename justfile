fetch-models:
    bun scripts/fetch-models.ts

setup:
    test -x node_modules/.bin/biome -a -x node_modules/.bin/tsc -a -x node_modules/.bin/vitest -a node_modules -nt package.json -a node_modules -nt bun.lock || bun install

check: setup
    bun run check

fmt: setup
    bun run format

# Publish current commit to npm (must be a tag)
publish:
    #!/usr/bin/env bash
    set -euo pipefail
    TAG=$(git describe --exact-match --tags HEAD 2>/dev/null) || { echo "error: HEAD is not a tag" >&2; exit 1; }
    VERSION="${TAG#v}"
    echo "publishing $TAG (version $VERSION)"
    npm version --no-git-tag-version --allow-same-version "$VERSION"
    npm publish --access public

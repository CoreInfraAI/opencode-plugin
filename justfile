fetch-models:
    bun scripts/fetch-models.ts

setup:
    test -x node_modules/.bin/biome -a -x node_modules/.bin/tsc -a -x node_modules/.bin/vitest -a node_modules -nt package.json -a node_modules -nt bun.lock || bun install

check: setup
    bun run check

fmt: setup
    bun run format

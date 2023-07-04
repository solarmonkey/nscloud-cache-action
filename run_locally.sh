(cd actions-toolkit/packages/cache; npm run tsc)
export NAMESPACE_CACHE_URL=http://actionscache.dev.nslocal.host:40080/
export RUNNER_TEMP=/tmp/cache-action
export ACTIONS_CACHE_URL=dummy
export GITHUB_REF=refs/heads/main
export INPUT_KEY=kirill
export INPUT_PATH=README.md
#npx ts-node src/restoreOnly.ts
npx ts-node src/saveOnly.ts
(cd actions-toolkit/packages/cache; npm run tsc)
export NAMESPACE_CACHE_URL=https://cache.github-services.staging-fra1.nscluster.cloud/
export RUNNER_TEMP=/tmp/cache-action
export ACTIONS_CACHE_URL=dummy
export GITHUB_REF=refs/heads/main
export INPUT_KEY=kirill
export INPUT_PATH=googlechrome.dmg
export NSC_TOKEN_FILE=token.json
npx ts-node src/restoreOnly.ts
#npx ts-node src/saveOnly.ts
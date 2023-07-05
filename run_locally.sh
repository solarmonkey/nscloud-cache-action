export PATH=/opt/homebrew/opt/node@16/bin:$PATH
node --version

(cd actions-toolkit/packages/cache; npm run tsc)
npx tsc

#export NAMESPACE_CACHE_URL=https://cache.github-services.staging-fra1.nscluster.cloud/
export NAMESPACE_CACHE_URL=http://actionscache.dev.nslocal.host:40080/
export RUNNER_TEMP=/tmp/cache-action
export ACTIONS_CACHE_URL=dummy
export GITHUB_REF=refs/heads/main
export INPUT_KEY=kirill
export INPUT_PATH=200MB.zip
export CACHE_DOWNLOAD_CONCURRENCY=8
export NSC_TOKEN_FILE=token.json

npx ts-node src/restoreOnly.ts
#npx ts-node src/saveOnly.ts

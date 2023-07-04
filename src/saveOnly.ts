import * as core from "@actions/core";

import saveImpl from "./saveImpl";
import { NullStateProvider } from "./stateProvider";

async function run(): Promise<void> {
    await saveImpl(new NullStateProvider());
}

run();

export default run;

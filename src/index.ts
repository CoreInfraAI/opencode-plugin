import { server } from "./v1.ts";
import { setup } from "./v2.ts";

// One default export serves both OpenCode majors: OpenCode 1 calls server()
// and ignores setup, OpenCode 2 calls setup() and ignores server. Everything
// imported from @opencode/plugin is type-only because OpenCode 1 does not
// provide that package at runtime.
export default {
  id: "coreinfra-opencode-plugin",
  server,
  setup,
};

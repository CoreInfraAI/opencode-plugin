import type { Hooks, PluginInput } from "@opencode-ai/plugin";
declare function plugin(_input: PluginInput): Promise<Hooks>;
declare const _default: {
    id: string;
    server: typeof plugin;
};
export default _default;

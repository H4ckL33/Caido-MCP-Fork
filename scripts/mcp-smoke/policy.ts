import { assert, makeToolCaller } from "./_utils";

export const runPolicy = async (tools: Set<string>) => {
    const { callTool } = makeToolCaller(tools);
    for (const name of [
        "get_agent_safe_capabilities",
        "list_execution_grants",
        "list_egress_receipts",
    ]) {
        assert(tools.has(name), `${name} missing — load the v4 build`);
    }
    await callTool("get_agent_safe_capabilities", {});
    await callTool("list_execution_grants", {});
    await callTool("list_egress_receipts", { limit: 5 });
};

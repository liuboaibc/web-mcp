import test from "node:test";
import assert from "node:assert/strict";
import { buildInvokePageMethodTool } from "./invokePageMethod.js";
import { buildListPageMethodsTool } from "./listPageMethods.js";

const gateway = {
  async listMethods() {
    return {
      methods: [
        {
          name: "user.getById",
          description: "get user"
        }
      ]
    };
  },
  async invokeMethod() {
    return { id: "u-1", name: "demo" };
  }
};

test("listPageMethods tool returns method descriptors", async () => {
  const tool = buildListPageMethodsTool(gateway as never);
  const output = await tool.execute({});

  assert.equal(output.isError, undefined);
  assert.ok(output.structuredContent);
  assert.match(output.content[0].text, /user.getById/);
});

test("invokePageMethod tool returns invocation result", async () => {
  const tool = buildInvokePageMethodTool(gateway as never);
  const output = await tool.execute({
    method: "user.getById",
    args: ["u-1"]
  });

  assert.equal(output.isError, undefined);
  assert.ok(output.structuredContent);
  assert.match(output.content[0].text, /demo/);
});

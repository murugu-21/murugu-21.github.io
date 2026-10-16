import plugin from "./primitives.ts";
import { tester } from "./rule-tester.ts";

tester.run("json-schema-literal", plugin.rules["json-schema-literal"], {
  valid: [
    {
      name: "a generated schema, an object without properties, and properties without a type",
      code: `const input = z.toJSONSchema(SearchArgs);
const document = { type: "object", additionalProperties: true };
const shape = { properties: { slug: "x" } };
const typed = { type: "string", properties: [] };`
    }
  ],
  invalid: [
    {
      name: "an object literal declaring type object with properties, keys quoted or not, nested or not",
      code: `const schema = { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] };
const quoted = { "type": "object", "properties": {} };
const tool = { name: "get_post", inputSchema: { type: "object", properties: {} } };`,
      errors: [
        { messageId: "handWritten", line: 1 },
        { messageId: "handWritten", line: 2 },
        { messageId: "handWritten", line: 3 }
      ]
    }
  ]
});

tester.run("html-entity-literal", plugin.rules["html-entity-literal"], {
  valid: [
    {
      name: "plain text, a different entity, and an entity in a comment",
      code: `const title = "Tom & Jerry <3";
const nbsp = "&nbsp;";
// "&lt;" in a comment is fine
export { title, nbsp };`
    }
  ],
  invalid: [
    {
      name: "a string or template literal holding &lt; or &amp;, alone or inside text",
      code: `const lt = "&lt;";
const amp = s.replaceAll("&", "&amp;");
const html = '<p>&lt;script&gt;</p>';
const template = \`<p>\${name} &amp; co</p>\`;`,
      errors: [
        { messageId: "handEscaped", line: 1 },
        { messageId: "handEscaped", line: 2 },
        { messageId: "handEscaped", line: 3 },
        { messageId: "handEscaped", line: 4 }
      ]
    }
  ]
});

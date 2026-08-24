import {describe, expect, it} from "vitest";

import {buildOpenApiDocument} from "../api/openapi";
import {inlineRefs, resolveSchema} from "../mcp/schema";

const schemas = buildOpenApiDocument("https://murugappan.dev").components
  .schemas as Record<string, unknown>;

function hasRef(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasRef);
  if (typeof node === "object" && node !== null) {
    return Object.entries(node).some(([k, v]) => k === "$ref" || hasRef(v));
  }
  return false;
}

describe("inlineRefs", () => {
  const fixture = {
    Wrapper: {
      type: "object",
      properties: {
        item: {$ref: "#/components/schemas/Item"},
        items: {
          type: "array",
          items: {$ref: "#/components/schemas/Item"}
        }
      }
    },
    Item: {type: "object", properties: {id: {type: "string"}}}
  };

  it("replaces a $ref with the schema it points at", () => {
    expect(inlineRefs({$ref: "#/components/schemas/Item"}, fixture)).toEqual(
      fixture.Item
    );
  });

  it("inlines refs nested in properties and array items", () => {
    const out = inlineRefs(fixture.Wrapper, fixture) as {
      properties: {item: unknown; items: {items: unknown}};
    };
    expect(out.properties.item).toEqual(fixture.Item);
    expect(out.properties.items.items).toEqual(fixture.Item);
  });

  it("does not mutate the source schemas", () => {
    const before = JSON.stringify(fixture);
    inlineRefs(fixture.Wrapper, fixture);
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it("keeps sibling keywords alongside a $ref", () => {
    const out = inlineRefs(
      {$ref: "#/components/schemas/Item", description: "one item"},
      fixture
    ) as {description: string; type: string};
    expect(out.description).toBe("one item");
    expect(out.type).toBe("object");
  });

  it("throws on a $ref that points nowhere", () => {
    expect(() =>
      inlineRefs({$ref: "#/components/schemas/Ghost"}, fixture)
    ).toThrow(/Ghost/);
  });

  it("throws on an external $ref rather than dereferencing a network URI", () => {
    expect(() =>
      inlineRefs({$ref: "https://evil.example/schema.json"}, fixture)
    ).toThrow(/external/i);
  });

  it("throws rather than looping forever on a cyclic $ref", () => {
    const cyclic = {
      A: {type: "object", properties: {b: {$ref: "#/components/schemas/A"}}}
    };
    expect(() => inlineRefs(cyclic.A, cyclic)).toThrow(/depth/i);
  });
});

describe("resolveSchema", () => {
  it("produces a self-contained schema for a real API response type", () => {
    const out = resolveSchema("Profile", schemas);
    expect(hasRef(out)).toBe(false);
    expect(out.type).toBe("object");
    const props = out.properties as {person: {properties: object}};
    expect(props.person.properties).toHaveProperty("currentRole");
  });

  it("resolves every schema the API document declares", () => {
    for (const name of Object.keys(schemas)) {
      expect(hasRef(resolveSchema(name, schemas)), name).toBe(false);
    }
  });
});

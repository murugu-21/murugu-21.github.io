import { defineRule } from "vite-plus/lint/plugins";

import {
  containsUnknownType,
  functionParameterBindingName,
  functionParameterTypeAnnotation,
  signatureVisitors,
  type FunctionSignature
} from "./function-parameters.ts";

function isTypePredicateSubject(owner: FunctionSignature, parameterName: string): boolean {
  const predicate = owner.returnType?.typeAnnotation;
  return (
    predicate?.type === "TSTypePredicate" &&
    predicate.parameterName.type === "Identifier" &&
    predicate.parameterName.name === parameterName
  );
}

export const noUnknownParametersRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow explicitly unknown function parameters except `cause` and type-predicate subjects; decode unknown input at its I/O boundary instead."
    },
    messages: {
      unknownParameter:
        "Parameter `{{parameter}}` leaves input unparsed. Accept a named domain type; run the expected schema or parser at the I/O boundary before calling this function."
    }
  },
  createOnce(context) {
    const checkParameters = (node: FunctionSignature) => {
      for (const parameter of node.params) {
        const annotation = functionParameterTypeAnnotation(parameter);
        if (annotation === null || annotation === undefined) continue;
        if (!containsUnknownType(annotation.typeAnnotation)) continue;
        const name = functionParameterBindingName(parameter, context.sourceCode);
        if (name === "cause" || isTypePredicateSubject(node, name)) continue;
        context.report({
          node: annotation.typeAnnotation,
          messageId: "unknownParameter",
          data: { parameter: name }
        });
      }
    };

    return signatureVisitors(checkParameters);
  }
});

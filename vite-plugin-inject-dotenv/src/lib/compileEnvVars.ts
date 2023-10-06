import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { valueToNode } from "@babel/types";
import generate from "@babel/generator";

export async function compileEnvVars(code: string, privateEnvVarName: string) {
  const ast = parse(code, { sourceType: 'module' });

  traverse(ast, {
    MemberExpression(path) {
      try {
        // handle `import.meta.env` format
        const { node } = path;
        if (
          node.object.type === 'MetaProperty' &&
          node.object.meta.name === 'import' &&
          node.object.property.name === 'meta' &&
          node.property.type === 'Identifier' &&
          node.property.name === 'env'
        ) {
          path.replaceWithSourceString(privateEnvVarName);
        }

        // handle `process.env` format
        if (path.get('object').matchesPattern('process.env')) {
          const envKey = path.toComputedKey();
          path.replaceWith(
            valueToNode(`${privateEnvVarName}.${(envKey as any)?.value}`)
          );
        }
      } catch (e) {
        console.error(e);
      }
    },
  });

  return generate(ast, {}, '');
}

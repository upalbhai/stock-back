module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  let hasModifications = false;

  // Find res.status(xxx).json({ ... })
  root.find(j.CallExpression, {
    callee: {
      type: "MemberExpression",
      object: {
        type: "CallExpression",
        callee: {
          type: "MemberExpression",
          object: { name: "res" },
          property: { name: "status" }
        }
      },
      property: { name: "json" }
    }
  }).forEach(path => {
    hasModifications = true;
    const statusCode = path.node.callee.object.arguments[0]; // xxx
    const jsonArg = path.node.arguments[0]; // { message: "...", data: ... }

    // If jsonArg is an ObjectExpression, we extract message, data, etc.
    if (jsonArg && jsonArg.type === "ObjectExpression") {
      let isError = false;
      if (statusCode && statusCode.type === "Literal" && statusCode.value >= 400) {
        isError = true;
      }

      const newProps = [
        j.property("init", j.identifier("res"), j.identifier("res"))
      ];

      if (statusCode) {
        newProps.push(j.property("init", j.identifier("statusCode"), statusCode));
      }

      let hasMessage = false;
      let hasDataOrErrors = false;

      jsonArg.properties.forEach(p => {
        if (p.key.name === "message") {
          newProps.push(p);
          hasMessage = true;
        } else if (p.key.name !== "success") { // exclude success: true/false
          if (isError && p.key.name !== 'errors') {
             // If property is something else, maybe map to errors or leave it
             if (p.key.name === 'error') {
                 newProps.push(j.property("init", j.identifier("errors"), p.value));
             } else {
                 newProps.push(p);
             }
          } else {
             newProps.push(p);
          }
        }
      });

      const functionName = isError ? "errorResponse" : "successResponse";
      const newCall = j.callExpression(j.identifier(functionName), [
        j.objectExpression(newProps)
      ]);
      j(path).replaceWith(newCall);
    }
  });

  // Find res.json({ ... }) (defaults to 200)
  root.find(j.CallExpression, {
    callee: {
      type: "MemberExpression",
      object: { name: "res" },
      property: { name: "json" }
    }
  }).forEach(path => {
    // If it's already inside a res.status().json() call handled above, wait, the parent might have been replaced. But jscodeshift visits carefully.
    // Let's ensure the object is just "res" and not "res.status(...)"
    if (path.node.callee.object.type === "Identifier" && path.node.callee.object.name === "res") {
      hasModifications = true;
      const jsonArg = path.node.arguments[0];

      if (jsonArg && jsonArg.type === "ObjectExpression") {
        const newProps = [
          j.property("init", j.identifier("res"), j.identifier("res"))
        ];

        jsonArg.properties.forEach(p => {
          if (p.key.name !== "success") {
            newProps.push(p);
          }
        });

        const newCall = j.callExpression(j.identifier("successResponse"), [
          j.objectExpression(newProps)
        ]);
        j(path).replaceWith(newCall);
      }
    }
  });

  if (hasModifications) {
    // Add imports
    const imports = root.find(j.ImportDeclaration);
    const hasSuccessImport = root.find(j.ImportDeclaration, {
      source: { value: "../utils/successResponse.js" }
    }).length > 0;
    const hasErrorImport = root.find(j.ImportDeclaration, {
      source: { value: "../utils/errorResponse.js" }
    }).length > 0;

    if (!hasSuccessImport) {
      const imp = j.importDeclaration(
        [j.importSpecifier(j.identifier("successResponse"))],
        j.literal("../utils/successResponse.js")
      );
      if (imports.length) imports.at(0).insertBefore(imp);
      else root.get().node.program.body.unshift(imp);
    }
    if (!hasErrorImport) {
      const imp = j.importDeclaration(
        [j.importSpecifier(j.identifier("errorResponse"))],
        j.literal("../utils/errorResponse.js")
      );
      if (imports.length) imports.at(0).insertBefore(imp);
      else root.get().node.program.body.unshift(imp);
    }
  }

  return root.toSource();
};

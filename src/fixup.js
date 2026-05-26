module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const successKeys = ['res', 'statusCode', 'message', 'data', 'meta'];
  const errorKeys = ['res', 'statusCode', 'message', 'errors'];

  root.find(j.CallExpression, {
    callee: { name: 'successResponse' }
  }).forEach(path => {
    const arg = path.node.arguments[0];
    if (arg && arg.type === 'ObjectExpression') {
      const topLevelProps = [];
      const dataProps = [];

      arg.properties.forEach(p => {
        if (p.type === 'Property') {
          if (successKeys.includes(p.key.name)) {
            topLevelProps.push(p);
          } else {
            dataProps.push(p);
          }
        } else {
          dataProps.push(p);
        }
      });

      if (dataProps.length > 0) {
        topLevelProps.push(j.property('init', j.identifier('data'), j.objectExpression(dataProps)));
        path.node.arguments[0] = j.objectExpression(topLevelProps);
      }
    }
  });

  root.find(j.CallExpression, {
    callee: { name: 'errorResponse' }
  }).forEach(path => {
    const arg = path.node.arguments[0];
    if (arg && arg.type === 'ObjectExpression') {
      const topLevelProps = [];
      const errorsProps = [];

      arg.properties.forEach(p => {
        if (p.type === 'Property') {
          if (errorKeys.includes(p.key.name)) {
            topLevelProps.push(p);
          } else {
            errorsProps.push(p);
          }
        } else {
          errorsProps.push(p);
        }
      });

      if (errorsProps.length > 0) {
        topLevelProps.push(j.property('init', j.identifier('errors'), j.objectExpression(errorsProps)));
        path.node.arguments[0] = j.objectExpression(topLevelProps);
      }
    }
  });

  return root.toSource();
};
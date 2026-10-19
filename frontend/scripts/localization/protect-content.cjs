// Exclude API/user-content expressions before React creates localized hosts.
// This is a source transform, never a DOM scan or a translation API request.
module.exports = function ({ types: t }) {
  const displayLibrary = /^(?:@mui\/|react-router(?:-dom)?$|recharts$|lucide-react$)/;
  return { name: 'protect-user-content', visitor: {
    Program: { enter(path) { path.setData('needsOriginal', false); }, exit(path) {
      if (path.getData('needsOriginal')) path.unshiftContainer('body', t.importDeclaration([
        t.importSpecifier(t.identifier('__smajOriginal'), t.identifier('originalContent')),
      ], t.stringLiteral('@smaj/localization/jsx-runtime')));
    } },
    JSXOpeningElement(path) {
      let name = path.node.name;
      while (t.isJSXMemberExpression(name)) name = name.object;
      if (!t.isJSXIdentifier(name) || /^[a-z]/.test(name.name)) return;
      const binding = path.scope.getBinding(name.name);
      const declaration = binding?.path.parentPath;
      // Only audited UI dependencies receive translated display props. Custom
      // application components keep their data props (including title) intact.
      if (declaration?.isImportDeclaration() && displayLibrary.test(declaration.node.source.value)) {
        path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier('__smajDisplay'), t.jsxExpressionContainer(t.booleanLiteral(true))));
      }
    },
    JSXExpressionContainer(path) {
      if (path.parentPath.isJSXAttribute()) return;
      const expression = path.node.expression;
      const direct = t.isMemberExpression(expression) || t.isOptionalMemberExpression(expression);
      const roots = /^(?:product|message|msg|m|conversation|chat|notification|review|seller|provider|restaurant|property|candidate|application|course|user|profile|booking|order|comment|post|video|channel|appointment|agent|tutor|institution)$/;
      let root = expression;
      while (t.isMemberExpression(root) || t.isOptionalMemberExpression(root)) root = root.object;
      const userVariable = t.isIdentifier(expression) && /^(?:messageText|bodyText|descriptionText|caption|authorName|participantName|displayName|username|draft)$/.test(expression.name);
      const property = direct && expression.property;
      const contentField = property && t.isIdentifier(property) && /^(?:title|name|description|message|text|body|content|caption|displayName|username|piUsername|participantName|lastMessage|bio|address|email|phone|review|comment)$/.test(property.name);
      if ((direct && contentField && t.isIdentifier(root) && roots.test(root.name)) || userVariable) {
        path.node.expression = t.callExpression(t.identifier('__smajOriginal'), [expression]);
        path.findParent(parent => parent.isProgram()).setData('needsOriginal', true);
      }
    },
  } };
};

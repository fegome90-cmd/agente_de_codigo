// Test Architecture Agent con código real
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";

console.log('🔍 Test con código TypeScript real...');

try {
  const parser = new Parser();
  parser.setLanguage(TypeScript);
  
  const tsCode = `
export interface User {
  id: number;
  name: string;
  email: string;
}

export class UserService {
  async getUser(id: number): Promise<User | null> {
    // Implementation here
    return null;
  }
}
`;
  
  const tree = parser.parse(tsCode);
  console.log('✅ TypeScript parsing exitoso');
  console.log('Root type:', tree.rootNode.type);
  console.log('Children:', tree.rootNode.childCount);
  
  // Contar nodos importantes
  let interfaces = 0;
  let classes = 0;
  
  function countNodes(node) {
    if (node.type === 'interface_declaration') interfaces++;
    if (node.type === 'class_declaration') classes++;
    for (let i = 0; i < node.namedChildCount; i++) {
      countNodes(node.namedChild(i));
    }
  }
  
  countNodes(tree.rootNode);
  console.log('✅ Interfaces:', interfaces);
  console.log('✅ Classes:', classes);
  
  console.log('🎉 Architecture Agent puede analizar TypeScript!');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

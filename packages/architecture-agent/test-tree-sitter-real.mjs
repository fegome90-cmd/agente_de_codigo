// Test real de tree-sitter importado como lo haría el Architecture Agent
import Parser from "tree-sitter";

console.log('🔍 Probando Parser desde architecture-agent context...');

try {
  const parser = new Parser();
  console.log('✅ Parser instance creado correctamente');
  
  // Test básico de parsing
  const tree = parser.parse('const x = 42;');
  console.log('✅ Parsing exitoso:', tree.rootNode.type);
  
  console.log('🎉 Architecture Agent puede usar tree-sitter!');
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}

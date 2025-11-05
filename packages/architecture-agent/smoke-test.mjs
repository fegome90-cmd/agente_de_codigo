#!/usr/bin/env node

/**
 * Tree-sitter Smoke Test para Architecture Agent
 * Verifica si tree-sitter puede inicializar correctamente
 */

console.log('🔥 Tree-sitter Smoke Test - Starting...');

try {
  console.log('📦 Importando tree-sitter modules...');

  // Intentar importaciones dinámicas para manejo de errores
  const treeSitter = await import('tree-sitter');
  const JavaScript = await import('tree-sitter-javascript');

  console.log('✅ Módulos importados exitosamente');
  console.log('Tree-sitter version:', treeSitter.version || 'unknown');
  console.log('Tree-sitter exports:', Object.keys(treeSitter));

  // Verificar si Parser está disponible
  const Parser = treeSitter.default || treeSitter.Parser;
  if (typeof Parser !== 'function') {
    throw new Error(`Parser no es constructor: ${typeof Parser}`);
  }

  console.log('✅ Parser constructor disponible');

  // Crear parser
  const parser = new Parser();
  console.log('✅ Parser instance created');

  // Configurar lenguaje
  const jsLang = JavaScript.default || JavaScript;
  parser.setLanguage(jsLang);
  console.log('✅ JavaScript language set');

  // Parsear código simple
  const sourceCode = 'function x() { return 42; }';
  const tree = parser.parse(sourceCode);
  console.log('✅ Parsing successful');

  // Verificar resultado
  console.log('🌳 Root node type:', tree.rootNode.type);
  console.log('🌳 Root node text:', tree.rootNode.text);
  console.log('🌳 Tree children count:', tree.rootNode.childCount);

  // Cleanup (opcional - GC se encarga en Node.js)
  console.log('✅ Cleanup completed');

  console.log('🎉 Tree-sitter smoke test PASSED! ✅');
  console.log('✅ Architecture Agent está listo para funcionar!');
  process.exit(0);

} catch (error) {
  console.error('❌ Tree-sitter smoke test FAILED:', error.message);
  console.error('Stack:', error.stack);

  console.log('\n🔧 Diagnostic info:');
  console.log('Node version:', process.version);
  console.log('Platform:', process.platform);
  console.log('Arch:', process.arch);

  process.exit(1);
}

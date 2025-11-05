#!/usr/bin/env node

/**
 * Tree-sitter Simple Smoke Test
 * Verificación básica de tree-sitter
 */

console.log('🔥 Tree-sitter Simple Smoke Test');

try {
  // Intentar importación básica
  const treeSitter = await import('tree-sitter');
  console.log('✅ Tree-sitter importado');
  console.log('Keys:', Object.keys(treeSitter));

  // Intentar usar Parser
  const Parser = treeSitter.default;
  if (typeof Parser === 'function') {
    console.log('✅ Parser es constructor');

    const parser = new Parser();
    console.log('✅ Parser instance created');
    parser.delete();
    console.log('✅ Parser cleanup');
  } else {
    console.log('❌ Parser no es constructor:', typeof Parser);
  }

} catch (error) {
  console.error('❌ Error:', error.message);
}

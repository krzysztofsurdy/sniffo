import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Parser, Language } from 'web-tree-sitter';
// web-tree-sitter needs WASM init before use

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_NODE_TYPES = [
    'enum_declaration',
    'class_declaration',
    'interface_declaration',
    'trait_declaration',
    'namespace_definition',
    'method_declaration',
    'property_promotion_parameter',
    'union_type',
    'intersection_type',
];

async function main() {
    await Parser.init();

    const phpWasmPath = join(__dirname, 'node_modules/tree-sitter-php/tree-sitter-php.wasm');
    const PHP = await Language.load(phpWasmPath);

    const parser = new Parser();
    parser.setLanguage(PHP);

    const fixtureCode = readFileSync(join(__dirname, 'fixtures/modern-php.php'), 'utf-8');
    const tree = parser.parse(fixtureCode);

    // Collect all node types in the tree
    const foundTypes = new Map();
    const errorNodes = [];

    function walk(node, depth = 0) {
        if (node.type === 'ERROR') {
            const startLine = node.startPosition.row + 1;
            const endLine = node.endPosition.row + 1;
            const snippet = fixtureCode.split('\n').slice(startLine - 1, endLine).join('\n').trim();
            errorNodes.push({ startLine, endLine, snippet });
        }

        for (const target of TARGET_NODE_TYPES) {
            if (node.type === target) {
                if (!foundTypes.has(target)) {
                    foundTypes.set(target, []);
                }
                const line = node.startPosition.row + 1;
                // Try to get a name for the node
                const nameNode = node.childForFieldName('name');
                const name = nameNode ? nameNode.text : `(line ${line})`;
                foundTypes.get(target).push({ name, line });
            }
        }

        for (let i = 0; i < node.childCount; i++) {
            walk(node.child(i), depth + 1);
        }
    }

    walk(tree.rootNode);

    // Report results
    console.log('=== Tree-sitter PHP 8.3+ Syntax Spike ===\n');

    console.log('--- Node Type Detection ---');
    for (const target of TARGET_NODE_TYPES) {
        const entries = foundTypes.get(target);
        if (entries && entries.length > 0) {
            const details = entries.map(e => `${e.name} (line ${e.line})`).join(', ');
            console.log(`  PASS  ${target}: found ${entries.length} [${details}]`);
        } else {
            console.log(`  FAIL  ${target}: not found`);
        }
    }

    console.log(`\n--- ERROR Nodes: ${errorNodes.length} ---`);
    if (errorNodes.length > 0) {
        for (const err of errorNodes) {
            console.log(`  Lines ${err.startLine}-${err.endLine}: ${err.snippet.substring(0, 120)}`);
        }
    } else {
        console.log('  No parse errors detected.');
    }

    // Also dump all unique node types for reference
    const allTypes = new Set();
    function collectTypes(node) {
        allTypes.add(node.type);
        for (let i = 0; i < node.childCount; i++) {
            collectTypes(node.child(i));
        }
    }
    collectTypes(tree.rootNode);

    console.log(`\n--- All unique node types found (${allTypes.size}) ---`);
    const sorted = [...allTypes].sort();
    console.log(`  ${sorted.join(', ')}`);

    // Summary
    const passCount = TARGET_NODE_TYPES.filter(t => foundTypes.has(t)).length;
    const failCount = TARGET_NODE_TYPES.length - passCount;
    console.log(`\n--- Summary ---`);
    console.log(`  Passed: ${passCount}/${TARGET_NODE_TYPES.length}`);
    console.log(`  Failed: ${failCount}/${TARGET_NODE_TYPES.length}`);
    console.log(`  Errors: ${errorNodes.length}`);

    if (failCount === 0 && errorNodes.length === 0) {
        console.log('\n  VERDICT: tree-sitter-php fully supports PHP 8.3+ syntax.');
    } else if (errorNodes.length > 0) {
        console.log('\n  VERDICT: tree-sitter-php has parse errors on some PHP 8.3+ syntax.');
    } else {
        console.log('\n  VERDICT: tree-sitter-php parses without errors but some node types use different names.');
    }
}

main().catch(err => {
    console.error('Spike failed:', err);
    process.exit(1);
});

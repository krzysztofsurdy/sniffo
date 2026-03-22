# Spike: tree-sitter-php PHP 8.3+ Support

**Date:** 2026-03-22
**Status:** APPROVED

## Question

Does tree-sitter-php (via web-tree-sitter WASM) correctly parse PHP 8.3+ syntax?

## Setup

- **web-tree-sitter:** 0.26.7
- **tree-sitter-php:** 0.24.2 (provides the `.wasm` grammar file)
- **Runtime:** Node.js 20.18.1

### Important: WASM Source

The `tree-sitter-wasms` package (0.1.13) bundles outdated WASM files incompatible with web-tree-sitter 0.26.7. Use the `.wasm` file shipped directly in the `tree-sitter-php` npm package instead (`tree-sitter-php/tree-sitter-php.wasm`).

## Results

All 9 target node types were detected. Zero parse errors.

| Node Type                    | Status | Count | Details                                        |
|------------------------------|--------|-------|------------------------------------------------|
| `enum_declaration`           | PASS   | 1     | Backed enum with methods                       |
| `class_declaration`          | PASS   | 3     | Abstract, readonly, and regular classes         |
| `interface_declaration`      | PASS   | 2     | Standard interfaces                             |
| `trait_declaration`          | PASS   | 1     | Trait with typed properties                     |
| `namespace_definition`       | PASS   | 1     | Multi-level namespace                           |
| `method_declaration`         | PASS   | 17    | Various return types, visibility                |
| `property_promotion_parameter` | PASS | 8     | Constructor promotion with readonly modifier    |
| `union_type`                 | PASS   | 2     | `string\|Email` style unions                    |
| `intersection_type`          | PASS   | 2     | `Identifiable&Serializable` style intersections |

### Additional PHP 8.2/8.3 Features Parsed Without Errors

- **Readonly classes** (`readonly class UserDto`) -- parsed as `class_declaration` with `readonly_modifier`
- **DNF types** (`(Identifiable&Serializable)|null`) -- parsed as `disjunctive_normal_form_type`
- **Typed class constants** (`public const string TABLE_NAME = 'users'`) -- parsed correctly
- **`#[\Override]` attribute** -- parsed as `attribute_list` / `attribute`
- **First-class callable syntax** (`$this->serialize(...)`) -- parsed as `variadic_placeholder`

### Node Types Available (112 total)

The parser produces a rich AST with 112 distinct node types, covering all modern PHP constructs needed for code analysis.

## Decision

**Use `web-tree-sitter` + `tree-sitter-php` for PHP parsing in this project.**

- Full PHP 8.3+ support confirmed
- Zero parse errors on comprehensive fixture
- All structural node types needed for code analysis are present
- The WASM approach works in Node.js without native compilation dependencies

### Package Requirements

```json
{
  "web-tree-sitter": "^0.26.7",
  "tree-sitter-php": "^0.24.2"
}
```

### Do NOT Use

- `tree-sitter-wasms` -- outdated WASM files, incompatible with current web-tree-sitter
- Native `tree-sitter` bindings -- requires C compilation, less portable

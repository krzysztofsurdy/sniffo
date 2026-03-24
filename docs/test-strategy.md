# Test Strategy: llmProjectSniffo

## Guiding Principle

Accuracy is the #1 quality attribute. Every test decision prioritizes: the graph must faithfully represent actual code relationships. Stale data must be detected. False positives and false negatives in relationship detection are the worst possible bugs.

---

## 1. Test Pyramid

### Unit Tests (70% of total tests)

| Package | Scope | Target Count |
|---|---|---|
| `packages/analysis` | AST parsing, relationship extractors, content hashing | ~120 tests |
| `packages/storage` | KuzuDB query builders, node/edge serialization, hash comparison | ~60 tests |
| `packages/mcp-server` | Tool input validation, response formatting, error mapping | ~40 tests |
| `packages/cli` | Argument parsing, command orchestration logic, config loading | ~30 tests |
| `packages/api` | Route handlers, request validation, response serialization | ~25 tests |
| `packages/web-ui` | React components (isolated), state management, data transforms | ~35 tests |
| **Total** | | **~310 unit tests** |

### Integration Tests (20% of total tests)

| Scope | Target Count |
|---|---|
| Analysis -> Storage pipeline (parse PHP, write to KuzuDB, read back) | ~30 tests |
| CLI -> Analysis -> Storage (full command execution) | ~15 tests |
| MCP Server -> Storage (tool queries against real DB) | ~15 tests |
| API -> Storage (HTTP request to DB response) | ~10 tests |
| Pre-commit hook -> Analysis -> Storage | ~5 tests |
| Incremental update pipeline (modify file, verify cascade) | ~15 tests |
| **Total** | **~90 integration tests** |

### E2E Tests -- Playwright (10% of total tests)

| Scope | Target Count |
|---|---|
| Graph visualization interactions | ~15 tests |
| Search and filter workflows | ~8 tests |
| Drill-down navigation (L1-L4) | ~6 tests |
| Freshness indicators and refresh | ~5 tests |
| Export functionality | ~3 tests |
| **Total** | **~37 E2E tests** |

### What NOT To Test (and Why)

- **Tree-sitter grammar correctness**: Tree-sitter is a well-tested third-party parser. Test our extraction logic, not the grammar itself.
- **KuzuDB query execution internals**: Trust the database engine. Test that our queries produce correct results, not that Cypher evaluates correctly.
- **Sigma.js rendering math**: Do not test that force-directed layout produces specific pixel coordinates. Test that correct data reaches the renderer.
- **React component styling**: Do not test CSS values. Test behavior and data display.
- **Third-party MCP SDK protocol handling**: Test our tool handlers, not the transport layer.
- **Node.js fs module behavior**: Do not test that `readFile` reads files. Test our file-discovery and filtering logic.

---

## 2. Analysis Accuracy Tests (MOST CRITICAL)

### 2.1 PHP Fixture Project Structure

```
test/fixtures/php-project/
  src/
    Controller/
      UserController.php          # Instance method calls, constructor injection
      AbstractController.php      # Abstract class, abstract methods
    Service/
      UserService.php             # Implements interface, uses trait, type hints
      NotificationService.php     # Static method calls, closures
      CacheService.php            # Chained method calls
    Repository/
      UserRepository.php          # Extends base class, property access
      BaseRepository.php          # Generic base with type hints
    Model/
      User.php                    # Entity with traits, properties, type hints
      Address.php                 # Value object, referenced by User
    Interface/
      UserServiceInterface.php    # Interface definition
      RepositoryInterface.php     # Interface with return type hints
      NotifiableInterface.php     # Multi-implementation interface
    Trait/
      TimestampableTrait.php      # Trait with methods and properties
      SoftDeletableTrait.php      # Trait used by multiple classes
    Event/
      UserCreatedEvent.php        # Anonymous class usage, callbacks
    Config/
      ServiceProvider.php         # Complex DI wiring, closures
    Circular/
      NodeA.php                   # Circular dependency: A -> B
      NodeB.php                   # Circular dependency: B -> C
      NodeC.php                   # Circular dependency: C -> A
```

### 2.2 Test Categories and Cases

Each test asserts both **completeness** (all expected relationships present) and **correctness** (no unexpected relationships present).

#### Category: Class Inheritance (`extends`)

**Fixture**: `UserRepository extends BaseRepository`

```
Test: analysis.inheritance.extendsBaseClass
  Input: UserRepository.php, BaseRepository.php
  Assert edges:
    - (UserRepository) -[EXTENDS]-> (BaseRepository) EXISTS
  Assert NO edges:
    - (BaseRepository) -[EXTENDS]-> (UserRepository) ABSENT
  Assert node count: exactly 2 class nodes
```

```
Test: analysis.inheritance.abstractExtends
  Input: UserController.php, AbstractController.php
  Assert edges:
    - (UserController) -[EXTENDS]-> (AbstractController) EXISTS
  Assert properties:
    - AbstractController.isAbstract = true
```

```
Test: analysis.inheritance.deepChain
  Input: Three-level hierarchy fixture (GrandChild -> Child -> Parent)
  Assert edges:
    - (GrandChild) -[EXTENDS]-> (Child) EXISTS
    - (Child) -[EXTENDS]-> (Parent) EXISTS
  Assert NO edges:
    - (GrandChild) -[EXTENDS]-> (Parent) ABSENT  // no transitive edge
```

#### Category: Interface Implementation (`implements`)

```
Test: analysis.interface.singleImplementation
  Input: UserService.php, UserServiceInterface.php
  Assert edges:
    - (UserService) -[IMPLEMENTS]-> (UserServiceInterface) EXISTS

Test: analysis.interface.multipleImplementation
  Input: UserService.php, NotifiableInterface.php, UserServiceInterface.php
  Assert edges:
    - (UserService) -[IMPLEMENTS]-> (UserServiceInterface) EXISTS
    - (UserService) -[IMPLEMENTS]-> (NotifiableInterface) EXISTS
  Assert edge count from UserService with IMPLEMENTS type: exactly 2

Test: analysis.interface.multipleImplementors
  Input: Two classes implementing RepositoryInterface
  Assert edges:
    - (UserRepository) -[IMPLEMENTS]-> (RepositoryInterface) EXISTS
    - (OrderRepository) -[IMPLEMENTS]-> (RepositoryInterface) EXISTS
```

#### Category: Method Calls

```
Test: analysis.calls.instanceMethodCall
  Input: UserController.php calls $this->userService->findUser()
  Assert edges:
    - (UserController) -[CALLS]-> (UserService.findUser) EXISTS

Test: analysis.calls.staticMethodCall
  Input: NotificationService.php calls CacheService::getInstance()
  Assert edges:
    - (NotificationService) -[CALLS]-> (CacheService.getInstance) EXISTS
  Assert properties:
    - edge.callType = "static"

Test: analysis.calls.chainedMethodCalls
  Input: CacheService.php: $this->cache->get('key')->transform()->value()
  Assert edges:
    - Calls to get, transform, value all recorded
    - Chain order preserved in edge metadata

Test: analysis.calls.parentMethodCall
  Input: UserController calls parent::handle()
  Assert edges:
    - (UserController) -[CALLS]-> (AbstractController.handle) EXISTS
```

#### Category: Constructor Injection (Dependency Injection)

```
Test: analysis.di.constructorInjection
  Input: UserController.php with __construct(UserService $userService, ...)
  Assert edges:
    - (UserController) -[DEPENDS_ON]-> (UserService) EXISTS
  Assert properties:
    - edge.injectionType = "constructor"

Test: analysis.di.promotedProperties
  Input: Constructor with PHP 8 promoted properties
  Assert edges:
    - (Class) -[DEPENDS_ON]-> (InjectedType) EXISTS for each promoted param

Test: analysis.di.interfaceInjection
  Input: __construct(UserServiceInterface $service)
  Assert edges:
    - (Class) -[DEPENDS_ON]-> (UserServiceInterface) EXISTS
    - NOT (Class) -[DEPENDS_ON]-> (UserService) -- implementation not referenced
```

#### Category: Trait Usage

```
Test: analysis.trait.simpleUse
  Input: User.php uses TimestampableTrait
  Assert edges:
    - (User) -[USES_TRAIT]-> (TimestampableTrait) EXISTS

Test: analysis.trait.multipleTraits
  Input: User.php uses TimestampableTrait, SoftDeletableTrait
  Assert edges:
    - (User) -[USES_TRAIT]-> (TimestampableTrait) EXISTS
    - (User) -[USES_TRAIT]-> (SoftDeletableTrait) EXISTS
  Assert edge count from User with USES_TRAIT type: exactly 2

Test: analysis.trait.traitMethodsAccessible
  Input: User.php uses TimestampableTrait which defines getCreatedAt()
  Assert:
    - TimestampableTrait has method node getCreatedAt
    - Calling getCreatedAt on User resolves through trait
```

#### Category: Namespace Imports (use statements)

```
Test: analysis.imports.simpleUse
  Input: UserController.php with "use App\Service\UserService;"
  Assert edges:
    - (UserController file) -[IMPORTS]-> (UserService) EXISTS

Test: analysis.imports.groupedUse
  Input: "use App\Service\{UserService, NotificationService};"
  Assert edges:
    - IMPORTS edge for each grouped import

Test: analysis.imports.aliasedUse
  Input: "use App\Service\UserService as US;"
  Assert edges:
    - (File) -[IMPORTS]-> (UserService) EXISTS
  Assert properties:
    - edge.alias = "US"

Test: analysis.imports.unusedImport
  Input: Import statement for a class never referenced in the file body
  Assert edges:
    - IMPORTS edge still exists (import is real, usage is a separate concern)
  Assert:
    - No CALLS or DEPENDS_ON edge to the unused import
```

#### Category: Property Access

```
Test: analysis.property.directAccess
  Input: $this->repository->findAll()
  Assert edges:
    - (Class) -[ACCESSES_PROPERTY]-> (repository) EXISTS
    - (Class) -[CALLS]-> (Repository.findAll) EXISTS

Test: analysis.property.staticPropertyAccess
  Input: ClassName::$instance
  Assert edges:
    - (Caller) -[ACCESSES_PROPERTY]-> (ClassName.instance) EXISTS
  Assert properties:
    - edge.accessType = "static"
```

#### Category: Type Hints

```
Test: analysis.types.parameterTypeHint
  Input: function process(User $user, Address $address): void
  Assert edges:
    - (Method) -[REFERENCES_TYPE]-> (User) EXISTS
    - (Method) -[REFERENCES_TYPE]-> (Address) EXISTS

Test: analysis.types.returnTypeHint
  Input: function getUser(): User
  Assert edges:
    - (Method) -[REFERENCES_TYPE]-> (User) EXISTS
  Assert properties:
    - edge.position = "return"

Test: analysis.types.nullableType
  Input: function find(?int $id): ?User
  Assert edges:
    - (Method) -[REFERENCES_TYPE]-> (User) EXISTS
    - Scalar types (int) NOT stored as nodes (they are built-in)

Test: analysis.types.unionType
  Input: function handle(User|Address $entity): string|int
  Assert edges:
    - REFERENCES_TYPE edges for both User and Address
    - No edges for scalar union members (string, int)

Test: analysis.types.intersectionType
  Input: function process(Countable&Iterator $collection)
  Assert edges:
    - REFERENCES_TYPE edges for both Countable and Iterator
```

#### Category: Circular Dependencies

```
Test: analysis.circular.threeNodeCycle
  Input: NodeA -> NodeB -> NodeC -> NodeA
  Assert edges:
    - (NodeA) -[DEPENDS_ON]-> (NodeB) EXISTS
    - (NodeB) -[DEPENDS_ON]-> (NodeC) EXISTS
    - (NodeC) -[DEPENDS_ON]-> (NodeA) EXISTS
  Assert:
    - Analysis completes without infinite loop
    - All three nodes present
    - Cycle is detectable via graph query

Test: analysis.circular.selfReference
  Input: Class with self-referencing type hint (e.g., Fluent builder)
  Assert:
    - (Builder) -[REFERENCES_TYPE]-> (Builder) EXISTS
    - No infinite loop during analysis
```

#### Category: Anonymous Classes

```
Test: analysis.anonymous.inlineAnonymousClass
  Input: return new class implements SomeInterface { ... }
  Assert:
    - Anonymous class node created with generated identifier
    - (AnonymousClass) -[IMPLEMENTS]-> (SomeInterface) EXISTS

Test: analysis.anonymous.anonymousClassWithConstructor
  Input: new class($dependency) { public function __construct(Service $s) {} }
  Assert edges:
    - (AnonymousClass) -[DEPENDS_ON]-> (Service) EXISTS
```

#### Category: Closures and Callbacks

```
Test: analysis.closure.closureWithTypeHints
  Input: $fn = function(User $u): bool { ... }
  Assert:
    - REFERENCES_TYPE edge from closure to User

Test: analysis.closure.arrowFunction
  Input: $fn = fn(User $u) => $u->getName()
  Assert:
    - REFERENCES_TYPE edge from arrow function to User
    - CALLS edge to User.getName

Test: analysis.closure.closureBindingUseVars
  Input: function() use ($service) { $service->process(); }
  Assert:
    - CALLS edge to the process method
```

### 2.3 Verification Strategy

**Completeness Check** (no missing relationships):
- Each fixture file has a companion `.expected.json` describing every node and edge.
- Test asserts: `actualEdges` is a superset of `expectedEdges`.
- A second assertion counts total edges per type to catch missing ones.

**Correctness Check** (no false relationships):
- Test asserts: `actualEdges` is exactly equal to `expectedEdges` (bidirectional match).
- Any unexpected edge causes test failure with a descriptive diff showing the extra edge.

**Pattern**:
```typescript
// In every analysis accuracy test:
const result = await analyzeFixture('path/to/fixture');
const actual = toNormalizedGraph(result);
const expected = loadExpectedGraph('path/to/fixture.expected.json');

// Completeness: nothing missing
expect(actual.edges).toContainAllOf(expected.edges);

// Correctness: nothing extra
expect(actual.edges).toEqual(expect.arrayContaining(expected.edges));
expect(actual.edges).toHaveLength(expected.edges.length);
```

---

## 3. Freshness and Staleness Tests

### 3.1 Content Hash Tests

```
Test: freshness.hash.identicalContentSameHash
  Input: Read file, compute hash. Read same file again.
  Assert: hash1 === hash2

Test: freshness.hash.modifiedContentDifferentHash
  Input: Compute hash, modify one line, compute hash again.
  Assert: hash1 !== hash2

Test: freshness.hash.whitespaceOnlyChangeDetected
  Input: Add trailing whitespace to a line, recompute hash.
  Assert: hash changes (whitespace IS significant in PHP)

Test: freshness.hash.commentOnlyChangeDetected
  Input: Add a comment, recompute hash.
  Assert: hash changes (we track the full file, not just AST)

Test: freshness.hash.stableAcrossReads
  Input: Compute hash 100 times on same file content.
  Assert: all 100 hashes identical (no timestamp or random component)
```

### 3.2 Cascade Invalidation Tests

```
Test: freshness.cascade.dependentMarkedStale
  Setup: A depends on B. Analyze both. Modify B.
  Assert:
    - B marked stale (hash mismatch)
    - A marked stale (depends on stale node)
    - Unrelated file C NOT marked stale

Test: freshness.cascade.deepCascade
  Setup: A -> B -> C. Modify C.
  Assert: A, B, C all marked stale.

Test: freshness.cascade.interfaceChangeInvalidatesImplementors
  Setup: Interface I, classes A and B implement I. Modify I.
  Assert: A and B both marked stale.

Test: freshness.cascade.traitChangeInvalidatesUsers
  Setup: Trait T used by classes X and Y. Modify T.
  Assert: X and Y both marked stale.

Test: freshness.cascade.noFalseCascade
  Setup: A -> B, C -> D (independent subgraphs). Modify B.
  Assert: Only A and B stale. C and D remain fresh.
```

### 3.3 Pre-commit Hook Integration

```
Test: freshness.precommit.incrementalUpdateOnCommit
  Setup: Analyzed project under git. Stage a modified PHP file. Run hook.
  Assert:
    - Only modified file and its dependents re-analyzed
    - Hook exits 0 (does not block commit)
    - Updated timestamps on re-analyzed nodes

Test: freshness.precommit.newFileOnCommit
  Setup: Stage a new PHP file. Run hook.
  Assert: New file analyzed and added to graph.

Test: freshness.precommit.deletedFileOnCommit
  Setup: Stage a file deletion. Run hook.
  Assert: Deleted file's nodes and edges removed.

Test: freshness.precommit.hookTimeout
  Setup: Configure hook timeout to 100ms. Stage 1000 files.
  Assert: Hook exits 0 within timeout, queues background analysis.
```

### 3.4 Concurrent Update Handling

```
Test: freshness.concurrent.queryDuringUpdate
  Setup: Start analysis. Immediately query the graph.
  Assert:
    - Query returns results (possibly stale, not an error)
    - No database corruption
    - No deadlock

Test: freshness.concurrent.doubleAnalysisTrigger
  Setup: Trigger analysis. Trigger analysis again before first completes.
  Assert:
    - Second analysis either queues or is deduplicated
    - Final state is consistent
    - No duplicate nodes or edges
```

---

## 4. Incremental Update Tests

```
Test: incremental.addNewFile
  Setup: Analyzed project with 5 files. Add file 6 with dependency on file 2.
  Action: Run incremental update.
  Assert:
    - File 6 nodes and edges added
    - Files 1-5 NOT re-analyzed (timestamps unchanged)
    - New DEPENDS_ON edge from file 6 to file 2

Test: incremental.modifyFile
  Setup: Analyzed project. Modify UserService.php to add a new method.
  Action: Run incremental update.
  Assert:
    - UserService re-analyzed
    - New method node added
    - Existing edges from other files to UserService preserved
    - Files not depending on UserService NOT re-analyzed

Test: incremental.modifyFileWithCascade
  Setup: UserController depends on UserService. Modify UserService interface.
  Action: Run incremental update.
  Assert:
    - UserService re-analyzed
    - UserController re-analyzed (cascade)
    - Unrelated files NOT re-analyzed

Test: incremental.deleteFile
  Setup: Analyzed project with UserService. Delete UserService.php.
  Action: Run incremental update.
  Assert:
    - UserService node removed
    - All edges TO UserService removed
    - All edges FROM UserService removed
    - No orphaned method/property nodes from UserService
    - Dependent files marked stale but NOT auto-modified

Test: incremental.renameFile
  Setup: Rename UserService.php to AccountService.php (class name unchanged).
  Action: Run incremental update.
  Assert:
    - Old file path removed from graph
    - New file path added
    - Class node updated with new file location
    - Edges preserved (they reference the class, not the file path)

Test: incremental.moveFileToNewDirectory
  Setup: Move UserService.php from Service/ to Domain/Service/.
  Action: Run incremental update.
  Assert:
    - Old file path removed
    - New file path present
    - Namespace may change -- edges updated accordingly

Test: incremental.noChanges
  Setup: Analyzed project. Run incremental update with no file changes.
  Action: Run incremental update.
  Assert:
    - No files re-analyzed
    - Operation completes in < 1 second for 500-file project
    - All timestamps unchanged
```

---

## 5. MCP Tool Tests

### 5.1 `analyze` Tool

```
Test: mcp.analyze.validProject
  Input: { path: "/valid/php/project" }
  Assert: Returns analysis summary with node/edge counts.

Test: mcp.analyze.emptyDirectory
  Input: { path: "/empty/dir" }
  Assert: Returns success with 0 nodes, 0 edges. No error.

Test: mcp.analyze.nonExistentPath
  Input: { path: "/does/not/exist" }
  Assert: Returns structured error with message "Directory not found".

Test: mcp.analyze.nonPhpProject
  Input: { path: "/python/project" }
  Assert: Returns success with 0 PHP nodes. No error.

Test: mcp.analyze.permissionDenied
  Input: { path: "/root/protected" }
  Assert: Returns structured error about permissions.
```

### 5.2 `query` Tool

```
Test: mcp.query.classRelationships
  Input: { query: "What depends on UserService?" }
  Assert: Returns list of dependent classes with relationship types.

Test: mcp.query.emptyGraph
  Input: Query on project with no analysis data.
  Assert: Returns empty results, not an error.

Test: mcp.query.nonExistentClass
  Input: { query: "Show relationships for NonExistentClass" }
  Assert: Returns empty results with informative message.
```

### 5.3 `search` Tool

```
Test: mcp.search.exactClassName
  Input: { term: "UserService" }
  Assert: Returns UserService node with metadata.

Test: mcp.search.partialMatch
  Input: { term: "User" }
  Assert: Returns all nodes containing "User" in name.

Test: mcp.search.noResults
  Input: { term: "zzzznonexistent" }
  Assert: Returns empty array, not error.

Test: mcp.search.specialCharacters
  Input: { term: "App\\Service\\UserService" }
  Assert: Handles backslashes correctly, returns match.
```

### 5.4 `refresh` Tool

```
Test: mcp.refresh.triggersIncrementalUpdate
  Input: { path: "/project" }
  Assert: Only changed files re-analyzed. Returns diff summary.

Test: mcp.refresh.duringActiveAnalysis
  Input: Call refresh while analysis is running.
  Assert: Returns "analysis in progress" status, does not start duplicate.
```

### 5.5 Concurrency

```
Test: mcp.concurrent.queryDuringAnalysis
  Setup: Start long-running analysis.
  Action: Send query request mid-analysis.
  Assert: Query returns pre-analysis data. No crash. No deadlock.

Test: mcp.concurrent.multipleQueries
  Setup: Analyzed project.
  Action: Send 10 concurrent query requests.
  Assert: All return correct results. No data corruption.
```

---

## 6. Web UI Tests (Playwright)

### 6.1 Graph Rendering

```
Test: ui.graph.rendersCorrectNodeCount
  Setup: Analyze fixture project (known 12 classes).
  Navigate: Open web UI.
  Assert: Canvas contains exactly 12 visible nodes.

Test: ui.graph.rendersCorrectEdgeCount
  Setup: Fixture project with known 18 relationships.
  Assert: Graph displays exactly 18 edges.

Test: ui.graph.nodesHaveLabels
  Assert: Each node displays its class name as a visible label.
```

### 6.2 Node Interaction

```
Test: ui.node.clickOpensDetailPanel
  Action: Click on "UserService" node.
  Assert:
    - Detail panel slides open
    - Panel title is "UserService"
    - Panel shows file path, method list, relationship count

Test: ui.node.detailPanelShowsRelationships
  Action: Click "UserController" node.
  Assert:
    - Panel lists "depends on: UserService"
    - Panel lists "extends: AbstractController"

Test: ui.node.doubleClickNavigatesIn
  Action: Double-click a package-level node.
  Assert: View zooms into package contents.
```

### 6.3 Drill-Down Navigation

```
Test: ui.drilldown.L1toL2
  Action: Start at project overview (L1). Click a namespace group.
  Assert: View transitions to namespace level (L2) showing classes in that namespace.

Test: ui.drilldown.L2toL3
  Action: From namespace view, click a class node.
  Assert: View shows class internals (L3) -- methods, properties.

Test: ui.drilldown.L3toL4
  Action: From class view, click a method node.
  Assert: View shows method details (L4) -- parameters, calls, type references.

Test: ui.drilldown.breadcrumbNavigation
  Action: Navigate L1 -> L2 -> L3. Click L1 in breadcrumb.
  Assert: View returns to L1 project overview.

Test: ui.drilldown.breadcrumbShowsPath
  Action: Navigate to L3.
  Assert: Breadcrumb shows "Project > App\Service > UserService".

Test: ui.drilldown.backButtonWorks
  Action: Navigate L1 -> L2 -> L3. Press browser back.
  Assert: Returns to L2.
```

### 6.4 Search

```
Test: ui.search.findsClassByName
  Action: Type "UserService" in search box.
  Assert:
    - Dropdown shows "UserService" as result
    - Selecting it centers the graph on that node

Test: ui.search.highlightsMatchingNodes
  Action: Type "Controller" in search box.
  Assert: All controller nodes highlighted, others dimmed.

Test: ui.search.clearSearchRestoresView
  Action: Search for something, then clear the search box.
  Assert: All nodes return to normal visual state.

Test: ui.search.noResultsMessage
  Action: Type "zzzznotfound".
  Assert: "No results" message displayed.
```

### 6.5 Filters

```
Test: ui.filter.toggleEdgeTypeExtendsOff
  Action: Uncheck "extends" in filter panel.
  Assert: Inheritance edges hidden. Other edges remain.

Test: ui.filter.toggleEdgeTypeExtendsOn
  Action: Re-check "extends" after unchecking.
  Assert: Inheritance edges reappear.

Test: ui.filter.multipleFiltersCompose
  Action: Uncheck "extends" and "implements".
  Assert: Only DEPENDS_ON, CALLS, etc. edges visible.

Test: ui.filter.filtersPreserveNodeCount
  Action: Toggle edge filters.
  Assert: Node count unchanged (only edges affected).
```

### 6.6 Refresh and Freshness

```
Test: ui.refresh.buttonTriggersAnalysis
  Action: Click refresh button.
  Assert:
    - Loading indicator appears
    - After completion, graph updates
    - Timestamp updates to current time

Test: ui.freshness.staleNodesVisuallyDistinct
  Setup: Modify a file to make nodes stale.
  Assert:
    - Stale nodes have a different color/opacity/border
    - Fresh nodes look normal

Test: ui.freshness.timestampDisplayed
  Assert: Last analysis timestamp visible in the UI header.
```

### 6.7 Export

```
Test: ui.export.svgProducesValidFile
  Action: Click export SVG.
  Assert:
    - File downloads
    - File is valid SVG (parseable XML with <svg> root)
    - Contains expected number of node elements

Test: ui.export.pngProducesValidFile
  Action: Click export PNG.
  Assert:
    - File downloads
    - File is valid PNG (correct magic bytes)
    - Dimensions are reasonable (> 100x100 pixels)
```

---

## 7. Performance Tests

### 7.1 Analysis Time Benchmarks

```
Test: perf.analysis.small50Files
  Input: 50-file PHP fixture project.
  Assert: Full analysis completes in < 5 seconds.

Test: perf.analysis.medium500Files
  Input: 500-file PHP fixture project.
  Assert: Full analysis completes in < 30 seconds.

Test: perf.analysis.large5000Files
  Input: 5000-file PHP fixture project (generated from templates).
  Assert: Full analysis completes in < 5 minutes.
```

### 7.2 Incremental Update Time

```
Test: perf.incremental.singleFileIn5000
  Setup: 5000-file project fully analyzed.
  Action: Modify 1 file. Run incremental update.
  Assert: Update completes in < 3 seconds.

Test: perf.incremental.tenFilesIn5000
  Setup: 5000-file project fully analyzed.
  Action: Modify 10 files. Run incremental update.
  Assert: Update completes in < 10 seconds.
```

### 7.3 Graph Rendering Performance

```
Test: perf.render.100nodes
  Assert: Initial render < 1 second. Interaction FPS > 30.

Test: perf.render.500nodes
  Assert: Initial render < 3 seconds. Interaction FPS > 20.

Test: perf.render.2000nodes
  Assert: Initial render < 10 seconds. Interaction FPS > 15.
```

### 7.4 Memory Usage

```
Test: perf.memory.analysisDoesNotLeak
  Action: Analyze 500-file project 5 times consecutively.
  Assert: Memory usage after run 5 is within 10% of run 1.

Test: perf.memory.largeProjectPeakMemory
  Action: Analyze 5000-file project.
  Assert: Peak memory < 1 GB.
```

### 7.5 Pre-commit Hook Timing

```
Test: perf.precommit.singleFile
  Assert: Hook completes in < 2 seconds.

Test: perf.precommit.tenFiles
  Assert: Hook completes in < 5 seconds.

Test: perf.precommit.timeout
  Assert: Hook has a hard timeout of 10 seconds. If exceeded, exits 0 and queues background analysis.
```

---

## 8. Test Fixtures

### 8.1 Fixture Project Structure

The primary fixture is a self-contained PHP project at `test/fixtures/php-project/` that covers all parsing patterns. It MUST include:

| Pattern | Fixture File(s) |
|---|---|
| Class extends class | `BaseRepository.php`, `UserRepository.php` |
| Class implements interface | `UserServiceInterface.php`, `UserService.php` |
| Multiple interface implementation | `UserService.php` (implements 2 interfaces) |
| Trait usage (single) | `User.php`, `TimestampableTrait.php` |
| Trait usage (multiple) | `User.php` (uses 2 traits) |
| Constructor injection | `UserController.php` |
| PHP 8 promoted properties | `UserController.php` |
| Static method call | `NotificationService.php` |
| Instance method call | `UserController.php` |
| Chained method call | `CacheService.php` |
| Property access | `UserRepository.php` |
| Return type hint | `RepositoryInterface.php` |
| Parameter type hint | All service methods |
| Union types | Dedicated fixture |
| Intersection types | Dedicated fixture |
| Nullable types | Multiple fixtures |
| Anonymous class | `UserCreatedEvent.php` |
| Closure with type hints | `ServiceProvider.php` |
| Arrow function | `ServiceProvider.php` |
| Grouped use statement | `UserController.php` |
| Aliased use statement | Dedicated fixture |
| Circular dependency | `NodeA.php`, `NodeB.php`, `NodeC.php` |
| Abstract class | `AbstractController.php` |
| Self-referencing type | Builder pattern fixture |
| Unused import | Dedicated fixture |

### 8.2 Expected Graph Files

Each fixture directory contains a `__expected_graph.json`:

```json
{
  "nodes": [
    { "id": "App\\Service\\UserService", "type": "class", "file": "src/Service/UserService.php" },
    { "id": "App\\Service\\UserService::findUser", "type": "method", "parent": "App\\Service\\UserService" }
  ],
  "edges": [
    { "from": "App\\Service\\UserService", "to": "App\\Interface\\UserServiceInterface", "type": "IMPLEMENTS" },
    { "from": "App\\Service\\UserService", "to": "App\\Trait\\TimestampableTrait", "type": "USES_TRAIT" }
  ]
}
```

### 8.3 Fixture Maintenance

- **Golden file pattern**: Expected graphs are checked into version control. When the parser evolves, update fixtures deliberately (never auto-regenerate without review).
- **Fixture validation CI step**: A dedicated CI job parses all fixture `.expected.json` files and validates their schema.
- **Fixture coverage report**: A custom script verifies that every PHP language pattern in the parser's capability list has at least one fixture exercising it. Runs in CI; fails if a pattern is uncovered.
- **Fixture generation for performance tests**: Large fixture projects (500+, 5000+ files) are generated from templates at test setup time, not checked in.

---

## 9. CI/CD Integration

### 9.1 On Every PR

| Stage | Tests | Max Duration |
|---|---|---|
| Lint & Type Check | ESLint, TypeScript compiler | 2 min |
| Unit Tests | All ~310 unit tests via Vitest | 3 min |
| Integration Tests | All ~90 integration tests via Vitest | 5 min |
| Fixture Validation | Schema check of all `.expected.json` files | 30 sec |
| Fixture Coverage | Verify all parser patterns have fixtures | 30 sec |
| **Total** | | **~11 min** |

### 9.2 On Merge to Main (Post-Merge)

| Stage | Tests | Max Duration |
|---|---|---|
| E2E Tests | All ~37 Playwright tests | 10 min |
| Performance Smoke | Small (50-file) benchmark only | 2 min |
| **Total** | | **~12 min** |

### 9.3 Nightly

| Stage | Tests | Max Duration |
|---|---|---|
| Full Performance Suite | All benchmarks including 5000-file | 15 min |
| Memory Leak Detection | Repeated analysis runs | 10 min |
| Performance Regression | Compare against baseline metrics | 5 min |
| E2E Cross-Browser | Playwright on Chrome, Firefox, Safari | 30 min |
| **Total** | | **~60 min** |

### 9.4 Performance Regression Detection

- Baseline metrics stored in `test/perf/baselines.json`.
- After each nightly run, compare current metrics against baselines.
- Fail if any metric regresses by more than 15%.
- Baselines updated manually via explicit PR (never auto-updated).

### 9.5 Test Reporting

- **Format**: JUnit XML for CI system integration (GitHub Actions, etc.)
- **Vitest reporter**: `vitest --reporter=junit --outputFile=test-results/unit.xml`
- **Playwright reporter**: `playwright test --reporter=junit`
- **Coverage**: Istanbul via Vitest, with minimum thresholds:
  - `packages/analysis`: 90% line coverage (critical path)
  - `packages/storage`: 80% line coverage
  - `packages/mcp-server`: 80% line coverage
  - `packages/cli`: 70% line coverage
  - `packages/web-ui`: 60% line coverage (UI tested more via E2E)
- **Performance reports**: Custom JSON output compared against baselines.

---

## Appendix: Test File Organization

```
test/
  unit/
    analysis/
      inheritance.test.ts
      interface-implementation.test.ts
      method-calls.test.ts
      constructor-injection.test.ts
      trait-usage.test.ts
      namespace-imports.test.ts
      property-access.test.ts
      type-hints.test.ts
      circular-dependencies.test.ts
      abstract-classes.test.ts
      anonymous-classes.test.ts
      closures-callbacks.test.ts
    storage/
      kuzu-queries.test.ts
      node-serialization.test.ts
      edge-serialization.test.ts
      hash-computation.test.ts
    mcp-server/
      analyze-tool.test.ts
      query-tool.test.ts
      search-tool.test.ts
      refresh-tool.test.ts
    cli/
      init-command.test.ts
      analyze-command.test.ts
      update-command.test.ts
      serve-command.test.ts
      status-command.test.ts
    api/
      routes.test.ts
      validation.test.ts
    web-ui/
      components/
        graph-canvas.test.ts
        detail-panel.test.ts
        search-bar.test.ts
        filter-panel.test.ts
        breadcrumb.test.ts
  integration/
    analysis-to-storage.test.ts
    cli-pipeline.test.ts
    mcp-to-storage.test.ts
    api-to-storage.test.ts
    incremental-update.test.ts
    freshness-cascade.test.ts
    precommit-hook.test.ts
    concurrent-access.test.ts
  e2e/
    graph-rendering.spec.ts
    node-interaction.spec.ts
    drilldown-navigation.spec.ts
    search.spec.ts
    filters.spec.ts
    refresh-freshness.spec.ts
    export.spec.ts
  perf/
    analysis-benchmark.test.ts
    incremental-benchmark.test.ts
    render-benchmark.test.ts
    memory-benchmark.test.ts
    precommit-benchmark.test.ts
    baselines.json
  fixtures/
    php-project/
      src/
        Controller/
        Service/
        Repository/
        Model/
        Interface/
        Trait/
        Event/
        Config/
        Circular/
      __expected_graph.json
    generated/          # Generated at runtime for perf tests
      .gitkeep
```

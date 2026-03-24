import { readFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import {
  GraphLevel,
  NodeType,
  EdgeType,
  createNodeId,
  createEdgeId,
  hashFile,
  type AnalysisResult,
  type AnalysisError,
  type ParsedFile,
  type ParsedSymbol,
  type SymbolKind,
  type ReferenceKind,
} from '@sniffo/core';
import type { GraphStore, StoredNode, StoredEdge } from '@sniffo/storage';
import type { ParserRegistry } from '../parsers/parser-registry.js';
import { discoverFiles, type DiscoveredFile } from './file-discovery.js';
import { detectChanges, type FileChange } from './change-detector.js';
import { resolveReferences, type SymbolIndex } from './reference-resolver.js';
import { buildHierarchy } from './hierarchy-builder.js';
import { aggregateEdges } from './edge-aggregator.js';
import { cascadeInvalidation } from './cascade-invalidator.js';
import { detectWorkspaces, type WorkspaceInfo } from './workspace-detector.js';

export interface ProgressEvent {
  phase: 'discovery' | 'parsing' | 'storing' | 'resolution' | 'hierarchy' | 'aggregation';
  current: number;
  total: number;
  file?: string;
  detail?: string;
}

export interface PipelineOptions {
  rootDir: string;
  projectName: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  files?: string[];
  workspaces?: WorkspaceInfo | null;
  onProgress?: (event: ProgressEvent) => void;
}

interface ChangeDetectionResult {
  filesToProcess: FileChange[];
  filesScanned: number;
  filesSkipped: number;
}

const REFERENCE_KIND_TO_EDGE_TYPE: Record<string, EdgeType> = {
  extends: EdgeType.EXTENDS,
  implements: EdgeType.IMPLEMENTS,
  uses_trait: EdgeType.USES_TRAIT,
  calls: EdgeType.CALLS,
  instantiates: EdgeType.INSTANTIATES,
  imports: EdgeType.IMPORTS,
  injects: EdgeType.INJECTS,
  type_reference: EdgeType.DEPENDS_ON,
};

const SYMBOL_KIND_TO_NODE_TYPE: Record<string, NodeType> = {
  class: NodeType.CLASS,
  interface: NodeType.INTERFACE,
  trait: NodeType.TRAIT,
  enum: NodeType.ENUM,
  function: NodeType.FUNCTION,
  method: NodeType.METHOD,
  property: NodeType.PROPERTY,
  constant: NodeType.CONSTANT,
};

const CODE_LEVEL_KINDS = new Set(['method', 'property', 'constant']);

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.php': 'php',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
};

function extractParentFqn(fqn: string): string | null {
  const idx = fqn.lastIndexOf('::');
  if (idx === -1) return null;
  return fqn.slice(0, idx);
}

function extractNamespaceFromSymbols(parsed: ParsedFile): string | null {
  for (const sym of parsed.symbols) {
    if (!CODE_LEVEL_KINDS.has(sym.kind) && sym.fqn.includes('\\')) {
      const parts = sym.fqn.split('\\');
      return parts.slice(0, -1).join('\\');
    }
  }
  return null;
}

export class AnalysisPipeline {
  constructor(
    private readonly store: GraphStore,
    private readonly parserRegistry: ParserRegistry,
  ) {}

  async analyze(options: PipelineOptions): Promise<AnalysisResult> {
    return this.runPipeline(options, false);
  }

  async analyzeIncremental(options: PipelineOptions): Promise<AnalysisResult> {
    return this.runPipeline(options, true);
  }

  private async runPipeline(options: PipelineOptions, cascade: boolean): Promise<AnalysisResult> {
    const startTime = Date.now();
    const errors: AnalysisError[] = [];
    let symbolsFound = 0;
    let referencesFound = 0;
    let filesFailed = 0;

    const changeResult = options.files && options.files.length > 0
      ? await this.discoverSpecificFiles(options)
      : await this.discoverAndDetectChanges(options);

    const { filesToProcess, filesScanned, filesSkipped } = changeResult;

    options.onProgress?.({ phase: 'discovery', current: filesToProcess.length, total: filesToProcess.length });

    if (cascade) {
      const changedFilePaths = filesToProcess.map((f) => f.file.relativePath);
      if (changedFilePaths.length > 0) {
        await cascadeInvalidation(this.store, changedFilePaths);
      }
    }

    // Phase 1: Parse files in parallel batches
    const BATCH_SIZE = 20;
    const parsedFiles: ParsedFile[] = [];
    const parseResults: Array<{ parsed: ParsedFile; fileChange: typeof filesToProcess[0] }> = [];

    for (let batchStart = 0; batchStart < filesToProcess.length; batchStart += BATCH_SIZE) {
      const batch = filesToProcess.slice(batchStart, batchStart + BATCH_SIZE);
      const batchPromises = batch.map(async (fileChange) => {
        const parser = this.parserRegistry.getParserForFile(fileChange.file.absolutePath);
        if (!parser) return null;

        try {
          const source = await readFile(fileChange.file.absolutePath, 'utf-8');
          const parsed = await parser.parse(fileChange.file.relativePath, source);
          return { parsed, fileChange };
        } catch (err) {
          filesFailed++;
          errors.push({
            phase: 'parse',
            filePath: fileChange.file.relativePath,
            message: err instanceof Error ? err.message : String(err),
            recoverable: true,
          });
          return null;
        }
      });

      const results = await Promise.all(batchPromises);
      for (const result of results) {
        if (result) parseResults.push(result);
      }

      options.onProgress?.({ phase: 'parsing', current: Math.min(batchStart + BATCH_SIZE, filesToProcess.length), total: filesToProcess.length });
    }

    // Phase 2: Store nodes/edges in batches (much faster than one-by-one)
    const now = new Date().toISOString();
    const allNewNodes: StoredNode[] = [];
    const allNewEdges: StoredEdge[] = [];

    for (const { parsed, fileChange } of parseResults) {
      parsedFiles.push(parsed);

      await this.store.removeNodesByFilePath(fileChange.file.relativePath);

      for (const sym of parsed.symbols) {
        const nodeType = SYMBOL_KIND_TO_NODE_TYPE[sym.kind];
        if (!nodeType) continue;

        const level = CODE_LEVEL_KINDS.has(sym.kind)
          ? GraphLevel.CODE
          : GraphLevel.COMPONENT;

        const nodeId = createNodeId(nodeType, sym.fqn);

        allNewNodes.push({
          id: nodeId,
          type: nodeType,
          level,
          qualifiedName: sym.fqn,
          shortName: sym.name,
          filePath: fileChange.file.relativePath,
          startLine: sym.startLine,
          endLine: sym.endLine,
          contentHash: parsed.contentHash,
          isStale: false,
          lastAnalyzedAt: now,
          metadata: sym.metadata,
        });
        symbolsFound++;

        if (CODE_LEVEL_KINDS.has(sym.kind)) {
          const parentFqn = extractParentFqn(sym.fqn);
          if (parentFqn) {
            const parentNodeType = this.guessParentNodeType(parsed, parentFqn);
            const parentNodeId = createNodeId(parentNodeType, parentFqn);
            allNewEdges.push({
              id: createEdgeId(parentNodeId, nodeId, EdgeType.CONTAINS),
              source: parentNodeId,
              target: nodeId,
              type: EdgeType.CONTAINS,
              level: GraphLevel.COMPONENT,
              weight: 1.0,
              metadata: {},
            });
          }
        }
      }

      await this.store.setFileHash(
        fileChange.file.relativePath,
        fileChange.newHash,
        fileChange.file.sizeBytes,
      );
    }

    // Batch write nodes and edges
    const totalWrites = allNewNodes.length + allNewEdges.length;
    const WRITE_BATCH = 50000;
    let written = 0;
    options.onProgress?.({ phase: 'storing', current: 0, total: totalWrites, detail: `Writing ${allNewNodes.length} nodes...` });
    for (let i = 0; i < allNewNodes.length; i += WRITE_BATCH) {
      await this.store.upsertNodes(allNewNodes.slice(i, i + WRITE_BATCH));
      written = Math.min(i + WRITE_BATCH, allNewNodes.length);
      options.onProgress?.({ phase: 'storing', current: written, total: totalWrites, detail: `Nodes ${written}/${allNewNodes.length}` });
    }
    options.onProgress?.({ phase: 'storing', current: written, total: totalWrites, detail: `Writing ${allNewEdges.length} containment edges...` });
    for (let i = 0; i < allNewEdges.length; i += WRITE_BATCH) {
      await this.store.upsertEdges(allNewEdges.slice(i, i + WRITE_BATCH));
      written = allNewNodes.length + Math.min(i + WRITE_BATCH, allNewEdges.length);
      options.onProgress?.({ phase: 'storing', current: written, total: totalWrites, detail: `Edges ${Math.min(i + WRITE_BATCH, allNewEdges.length)}/${allNewEdges.length}` });
    }

    options.onProgress?.({ phase: 'resolution', current: 0, total: parsedFiles.length, detail: 'Building symbol index...' });
    const allNodes = await this.store.getAllNodes();
    const symbolIndex = this.buildSymbolIndex(allNodes);

    const refEdges: StoredEdge[] = [];
    for (let fi = 0; fi < parsedFiles.length; fi++) {
      const parsed = parsedFiles[fi];
      options.onProgress?.({ phase: 'resolution', current: fi, total: parsedFiles.length, detail: `Resolving ${parsed.filePath}` });
      const currentNamespace = extractNamespaceFromSymbols(parsed);

      const result = resolveReferences(
        parsed.references,
        parsed.imports,
        currentNamespace,
        symbolIndex,
      );

      for (const resolved of result.resolved) {
        const sourceNodeType = this.guessNodeTypeFromFqn(parsed, resolved.original.sourceSymbolFqn);
        const sourceNodeId = createNodeId(sourceNodeType, resolved.original.sourceSymbolFqn);
        const edgeType = REFERENCE_KIND_TO_EDGE_TYPE[resolved.original.kind] ?? EdgeType.DEPENDS_ON;

        refEdges.push({
          id: createEdgeId(sourceNodeId, resolved.targetNodeId, edgeType),
          source: sourceNodeId,
          target: resolved.targetNodeId,
          type: edgeType,
          level: GraphLevel.CODE,
          weight: 1.0,
          metadata: {
            sourceLocation: {
              file: resolved.original.filePath,
              line: resolved.original.line,
            },
            confidence: resolved.confidence,
          },
        });
        referencesFound++;
      }
    }

    // Batch write reference edges
    options.onProgress?.({ phase: 'resolution', current: parsedFiles.length, total: parsedFiles.length, detail: `Writing ${refEdges.length} reference edges...` });
    for (let i = 0; i < refEdges.length; i += WRITE_BATCH) {
      await this.store.upsertEdges(refEdges.slice(i, i + WRITE_BATCH));
      options.onProgress?.({ phase: 'resolution', current: parsedFiles.length, total: parsedFiles.length, detail: `Writing edges ${Math.min(i + WRITE_BATCH, refEdges.length)}/${refEdges.length}` });
    }

    options.onProgress?.({ phase: 'hierarchy', current: 0, total: 1, detail: 'Detecting workspaces...' });
    const workspaces = options.workspaces !== undefined
      ? options.workspaces
      : await detectWorkspaces(options.rootDir);

    options.onProgress?.({ phase: 'hierarchy', current: 0, total: 1, detail: 'Building hierarchy...' });
    const componentNodes = allNodes.filter((n) => n.level === GraphLevel.COMPONENT);
    const hierarchy = buildHierarchy(componentNodes, options.projectName, workspaces);

    await this.store.upsertNodes([hierarchy.systemNode, ...hierarchy.containerNodes]);
    await this.store.upsertEdges(hierarchy.containmentEdges);

    options.onProgress?.({ phase: 'hierarchy', current: 1, total: 1 });

    options.onProgress?.({ phase: 'aggregation', current: 0, total: 1, detail: 'Loading all edges...' });
    const allEdges = await this.store.getAllEdges();
    const codeEdges = allEdges.filter((e) => e.level === GraphLevel.CODE && e.type !== EdgeType.CONTAINS);

    const containmentMap = new Map<string, string>();
    const containsEdges = allEdges.filter((e) => e.type === EdgeType.CONTAINS);
    for (const e of containsEdges) {
      containmentMap.set(e.target, e.source);
    }

    const componentNodeIds = new Set(
      allNodes.filter(n => n.level === GraphLevel.COMPONENT).map(n => n.id),
    );
    const containerNodeIds = new Set(
      allNodes.filter(n => n.level === GraphLevel.CONTAINER).map(n => n.id),
    );
    options.onProgress?.({ phase: 'aggregation', current: 0, total: 1, detail: `Aggregating ${codeEdges.length} code edges...` });
    const aggregated = aggregateEdges(codeEdges, containmentMap, componentNodeIds, containerNodeIds);
    options.onProgress?.({ phase: 'aggregation', current: 0, total: 1, detail: `Writing ${aggregated.length} aggregated edges...` });
    for (let i = 0; i < aggregated.length; i += WRITE_BATCH) {
      await this.store.upsertEdges(aggregated.slice(i, i + WRITE_BATCH));
      options.onProgress?.({ phase: 'aggregation', current: 0, total: 1, detail: `Writing edges ${Math.min(i + WRITE_BATCH, aggregated.length)}/${aggregated.length}` });
    }

    options.onProgress?.({ phase: 'aggregation', current: 1, total: 1 });

    const filesAnalyzed = filesToProcess.length - filesFailed;

    return {
      filesScanned,
      filesAnalyzed,
      filesSkipped,
      filesFailed,
      symbolsFound,
      referencesFound,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  private async discoverAndDetectChanges(options: PipelineOptions): Promise<ChangeDetectionResult> {
    const includePatterns = options.includePatterns ?? ['**/*.php'];

    const discoveredFiles = await discoverFiles(
      options.rootDir,
      includePatterns,
      options.excludePatterns ?? [],
    );

    const changeSet = await detectChanges(
      discoveredFiles,
      (filePath) => this.store.getFileHash(filePath),
      () => this.store.getAllTrackedPaths(),
      hashFile,
    );

    for (const deletedPath of changeSet.deleted) {
      await this.store.removeNodesByFilePath(deletedPath);
      await this.store.removeFileHash(deletedPath);
    }

    return {
      filesToProcess: [...changeSet.added, ...changeSet.modified],
      filesScanned: discoveredFiles.length,
      filesSkipped: changeSet.unchanged.length,
    };
  }

  private async discoverSpecificFiles(options: PipelineOptions): Promise<ChangeDetectionResult> {
    const files = options.files!;
    const discovered: DiscoveredFile[] = [];

    for (const relativePath of files) {
      const absolutePath = join(options.rootDir, relativePath);
      const ext = extname(relativePath);
      const language = EXTENSION_TO_LANGUAGE[ext];
      if (!language) continue;

      try {
        const fileStat = await stat(absolutePath);
        discovered.push({
          relativePath,
          absolutePath,
          language,
          sizeBytes: fileStat.size,
        });
      } catch {
        // File may not exist
      }
    }

    const changeSet = await detectChanges(
      discovered,
      (filePath) => this.store.getFileHash(filePath),
      async () => [],
      hashFile,
    );

    return {
      filesToProcess: [...changeSet.added, ...changeSet.modified],
      filesScanned: discovered.length,
      filesSkipped: changeSet.unchanged.length,
    };
  }

  private buildSymbolIndex(nodes: StoredNode[]): SymbolIndex {
    const byFqn = new Map<string, string>();
    const byShortName = new Map<string, Array<{ fqn: string; nodeId: string }>>();

    for (const node of nodes) {
      if (node.level !== GraphLevel.COMPONENT && node.level !== GraphLevel.CODE) continue;

      byFqn.set(node.qualifiedName, node.id);

      const existing = byShortName.get(node.shortName) ?? [];
      existing.push({ fqn: node.qualifiedName, nodeId: node.id });
      byShortName.set(node.shortName, existing);
    }

    return { byFqn, byShortName };
  }

  private guessParentNodeType(parsed: ParsedFile, parentFqn: string): NodeType {
    for (const sym of parsed.symbols) {
      if (sym.fqn === parentFqn) {
        return SYMBOL_KIND_TO_NODE_TYPE[sym.kind] ?? NodeType.CLASS;
      }
    }
    return NodeType.CLASS;
  }

  private guessNodeTypeFromFqn(parsed: ParsedFile, fqn: string): NodeType {
    for (const sym of parsed.symbols) {
      if (sym.fqn === fqn) {
        return SYMBOL_KIND_TO_NODE_TYPE[sym.kind] ?? NodeType.CLASS;
      }
    }
    return NodeType.CLASS;
  }
}

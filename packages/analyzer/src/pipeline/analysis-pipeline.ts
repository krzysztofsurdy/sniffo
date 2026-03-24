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
  phase: 'discovery' | 'parsing' | 'resolution' | 'hierarchy' | 'aggregation';
  current: number;
  total: number;
  file?: string;
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

    const parsedFiles: ParsedFile[] = [];

    for (let fileIndex = 0; fileIndex < filesToProcess.length; fileIndex++) {
      const fileChange = filesToProcess[fileIndex];
      options.onProgress?.({ phase: 'parsing', current: fileIndex + 1, total: filesToProcess.length, file: fileChange.file.relativePath });

      const parser = this.parserRegistry.getParserForFile(fileChange.file.absolutePath);
      if (!parser) {
        continue;
      }

      try {
        const source = await readFile(fileChange.file.absolutePath, 'utf-8');
        const parsed = await parser.parse(fileChange.file.relativePath, source);
        parsedFiles.push(parsed);

        await this.store.removeNodesByFilePath(fileChange.file.relativePath);

        const now = new Date().toISOString();
        for (const sym of parsed.symbols) {
          const nodeType = SYMBOL_KIND_TO_NODE_TYPE[sym.kind];
          if (!nodeType) continue;

          const level = CODE_LEVEL_KINDS.has(sym.kind)
            ? GraphLevel.CODE
            : GraphLevel.COMPONENT;

          const nodeId = createNodeId(nodeType, sym.fqn);

          const node: StoredNode = {
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
          };

          await this.store.upsertNode(node);
          symbolsFound++;

          if (CODE_LEVEL_KINDS.has(sym.kind)) {
            const parentFqn = extractParentFqn(sym.fqn);
            if (parentFqn) {
              const parentNodeType = this.guessParentNodeType(parsed, parentFqn);
              const parentNodeId = createNodeId(parentNodeType, parentFqn);
              const containsEdge: StoredEdge = {
                id: createEdgeId(parentNodeId, nodeId, EdgeType.CONTAINS),
                source: parentNodeId,
                target: nodeId,
                type: EdgeType.CONTAINS,
                level: GraphLevel.COMPONENT,
                weight: 1.0,
                metadata: {},
              };
              await this.store.upsertEdge(containsEdge);
            }
          }
        }

        await this.store.setFileHash(
          fileChange.file.relativePath,
          fileChange.newHash,
          fileChange.file.sizeBytes,
        );
      } catch (err) {
        filesFailed++;
        errors.push({
          phase: 'parse',
          filePath: fileChange.file.relativePath,
          message: err instanceof Error ? err.message : String(err),
          recoverable: true,
        });
      }
    }

    const allNodes = await this.store.getAllNodes();
    const symbolIndex = this.buildSymbolIndex(allNodes);

    for (const parsed of parsedFiles) {
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

        const edge: StoredEdge = {
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
        };

        await this.store.upsertEdge(edge);
        referencesFound++;
      }
    }

    options.onProgress?.({ phase: 'resolution', current: parsedFiles.length, total: parsedFiles.length });

    const workspaces = options.workspaces !== undefined
      ? options.workspaces
      : await detectWorkspaces(options.rootDir);

    const componentNodes = allNodes.filter((n) => n.level === GraphLevel.COMPONENT);
    const hierarchy = buildHierarchy(componentNodes, options.projectName, workspaces);

    await this.store.upsertNode(hierarchy.systemNode);
    for (const containerNode of hierarchy.containerNodes) {
      await this.store.upsertNode(containerNode);
    }
    for (const edge of hierarchy.containmentEdges) {
      await this.store.upsertEdge(edge);
    }

    options.onProgress?.({ phase: 'hierarchy', current: 1, total: 1 });

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
    const aggregated = aggregateEdges(codeEdges, containmentMap, componentNodeIds, containerNodeIds);
    for (const edge of aggregated) {
      await this.store.upsertEdge(edge);
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
      if (node.level !== GraphLevel.COMPONENT) continue;

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

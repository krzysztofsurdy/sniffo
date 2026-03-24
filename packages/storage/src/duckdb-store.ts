import { Database } from 'duckdb-async';
import type { GraphStore, StoredNode, StoredEdge, AnalysisRun } from './graph-store.js';
import type { NodeType, EdgeType, GraphLevel } from '@sniffo/core';

export class DuckDBGraphStore implements GraphStore {
  private db: Database | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    this.db = await Database.create(this.dbPath);

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id VARCHAR PRIMARY KEY,
        type VARCHAR NOT NULL,
        level VARCHAR NOT NULL,
        qualified_name VARCHAR NOT NULL,
        short_name VARCHAR NOT NULL,
        file_path VARCHAR,
        start_line INTEGER,
        end_line INTEGER,
        content_hash VARCHAR,
        is_stale BOOLEAN NOT NULL DEFAULT false,
        last_analyzed_at VARCHAR NOT NULL,
        metadata VARCHAR NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS edges (
        id VARCHAR PRIMARY KEY,
        source VARCHAR NOT NULL,
        target VARCHAR NOT NULL,
        type VARCHAR NOT NULL,
        level VARCHAR NOT NULL,
        weight DOUBLE NOT NULL DEFAULT 1.0,
        metadata VARCHAR NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS file_hashes (
        file_path VARCHAR PRIMARY KEY,
        hash VARCHAR NOT NULL,
        size_bytes INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analysis_runs (
        id VARCHAR PRIMARY KEY,
        started_at VARCHAR NOT NULL,
        completed_at VARCHAR,
        trigger VARCHAR NOT NULL,
        files_analyzed INTEGER NOT NULL DEFAULT 0,
        nodes_created INTEGER NOT NULL DEFAULT 0,
        nodes_updated INTEGER NOT NULL DEFAULT 0,
        nodes_deleted INTEGER NOT NULL DEFAULT 0,
        edges_created INTEGER NOT NULL DEFAULT 0,
        edges_deleted INTEGER NOT NULL DEFAULT 0,
        status VARCHAR NOT NULL DEFAULT 'running'
      );
    `);

    try { await this.db.run('CREATE INDEX idx_nodes_qualified_name ON nodes (qualified_name)'); } catch { /* already exists */ }
    try { await this.db.run('CREATE INDEX idx_nodes_short_name ON nodes (short_name)'); } catch { /* already exists */ }
    try { await this.db.run('CREATE INDEX idx_nodes_type ON nodes (type)'); } catch { /* already exists */ }
    try { await this.db.run('CREATE INDEX idx_nodes_file_path ON nodes (file_path)'); } catch { /* already exists */ }
    try { await this.db.run('CREATE INDEX idx_edges_source ON edges (source)'); } catch { /* already exists */ }
    try { await this.db.run('CREATE INDEX idx_edges_target ON edges (target)'); } catch { /* already exists */ }
    try { await this.db.run('CREATE INDEX idx_edges_type ON edges (type)'); } catch { /* already exists */ }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  private getDb(): Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  // --- Nodes ---

  async upsertNode(node: StoredNode): Promise<void> {
    const db = this.getDb();
    await db.run(
      `INSERT OR REPLACE INTO nodes (id, type, level, qualified_name, short_name, file_path, start_line, end_line, content_hash, is_stale, last_analyzed_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      node.id,
      node.type,
      node.level,
      node.qualifiedName,
      node.shortName,
      node.filePath,
      node.startLine,
      node.endLine,
      node.contentHash,
      node.isStale,
      node.lastAnalyzedAt,
      JSON.stringify(node.metadata),
    );
  }

  async upsertNodes(nodes: StoredNode[]): Promise<void> {
    if (nodes.length === 0) return;
    const db = this.getDb();
    await db.run('BEGIN TRANSACTION');
    try {
      for (const node of nodes) {
        await db.run(
          `INSERT OR REPLACE INTO nodes (id, type, level, qualified_name, short_name, file_path, start_line, end_line, content_hash, is_stale, last_analyzed_at, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          node.id, node.type, node.level, node.qualifiedName, node.shortName,
          node.filePath, node.startLine, node.endLine, node.contentHash,
          node.isStale, node.lastAnalyzedAt, JSON.stringify(node.metadata),
        );
      }
      await db.run('COMMIT');
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  }

  async getNodeById(id: string): Promise<StoredNode | null> {
    const db = this.getDb();
    const rows = await db.all('SELECT * FROM nodes WHERE id = ?', id);
    if (rows.length === 0) return null;
    return this.mapRowToNode(rows[0]);
  }

  async getNodeByQualifiedName(fqn: string): Promise<StoredNode | null> {
    const db = this.getDb();
    const rows = await db.all('SELECT * FROM nodes WHERE qualified_name = ?', fqn);
    if (rows.length === 0) return null;
    return this.mapRowToNode(rows[0]);
  }

  async getNodesByShortName(shortName: string): Promise<StoredNode[]> {
    const db = this.getDb();
    const rows = await db.all('SELECT * FROM nodes WHERE short_name = ?', shortName);
    return rows.map((row) => this.mapRowToNode(row));
  }

  async getNodesByType(types: NodeType[]): Promise<StoredNode[]> {
    const db = this.getDb();
    const placeholders = types.map(() => '?').join(', ');
    const rows = await db.all(`SELECT * FROM nodes WHERE type IN (${placeholders})`, ...types);
    return rows.map((row) => this.mapRowToNode(row));
  }

  async getNodesByFilePath(filePath: string): Promise<StoredNode[]> {
    const db = this.getDb();
    const rows = await db.all('SELECT * FROM nodes WHERE file_path = ?', filePath);
    return rows.map((row) => this.mapRowToNode(row));
  }

  async removeNodesByFilePath(filePath: string): Promise<void> {
    const db = this.getDb();
    const nodeIds = await db.all('SELECT id FROM nodes WHERE file_path = ?', filePath);
    if (nodeIds.length > 0) {
      const ids = nodeIds.map((r) => r.id as string);
      const placeholders = ids.map(() => '?').join(', ');
      await db.run(`DELETE FROM edges WHERE source IN (${placeholders}) OR target IN (${placeholders})`, ...ids, ...ids);
    }
    await db.run('DELETE FROM nodes WHERE file_path = ?', filePath);
  }

  async getAllNodes(): Promise<StoredNode[]> {
    const db = this.getDb();
    const rows = await db.all('SELECT * FROM nodes');
    return rows.map((row) => this.mapRowToNode(row));
  }

  async markNodesStale(nodeIds: string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    const db = this.getDb();
    const placeholders = nodeIds.map(() => '?').join(', ');
    await db.run(`UPDATE nodes SET is_stale = true WHERE id IN (${placeholders})`, ...nodeIds);
  }

  async markNodesClean(nodeIds: string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    const db = this.getDb();
    const placeholders = nodeIds.map(() => '?').join(', ');
    await db.run(`UPDATE nodes SET is_stale = false WHERE id IN (${placeholders})`, ...nodeIds);
  }

  // --- Edges ---

  async upsertEdge(edge: StoredEdge): Promise<void> {
    const db = this.getDb();
    await db.run(
      `INSERT OR REPLACE INTO edges (id, source, target, type, level, weight, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      edge.id,
      edge.source,
      edge.target,
      edge.type,
      edge.level,
      edge.weight,
      JSON.stringify(edge.metadata),
    );
  }

  async upsertEdges(edges: StoredEdge[]): Promise<void> {
    if (edges.length === 0) return;
    const db = this.getDb();
    await db.run('BEGIN TRANSACTION');
    try {
      for (const edge of edges) {
        await db.run(
          `INSERT OR REPLACE INTO edges (id, source, target, type, level, weight, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          edge.id, edge.source, edge.target, edge.type, edge.level, edge.weight,
          JSON.stringify(edge.metadata),
        );
      }
      await db.run('COMMIT');
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  }

  async getOutgoingEdges(nodeId: string): Promise<StoredEdge[]> {
    const db = this.getDb();
    const rows = await db.all('SELECT * FROM edges WHERE source = ?', nodeId);
    return rows.map((row) => this.mapRowToEdge(row));
  }

  async getIncomingEdges(nodeId: string): Promise<StoredEdge[]> {
    const db = this.getDb();
    const rows = await db.all('SELECT * FROM edges WHERE target = ?', nodeId);
    return rows.map((row) => this.mapRowToEdge(row));
  }

  async getEdgesByType(type: EdgeType): Promise<StoredEdge[]> {
    const db = this.getDb();
    const rows = await db.all('SELECT * FROM edges WHERE type = ?', type);
    return rows.map((row) => this.mapRowToEdge(row));
  }

  async removeEdgesBySourceFilePath(filePath: string): Promise<void> {
    const db = this.getDb();
    await db.run(
      `DELETE FROM edges WHERE source IN (SELECT id FROM nodes WHERE file_path = ?)`,
      filePath,
    );
  }

  async removeEdgesByNodeId(nodeId: string): Promise<void> {
    const db = this.getDb();
    await db.run('DELETE FROM edges WHERE source = ? OR target = ?', nodeId, nodeId);
  }

  async getAllEdges(): Promise<StoredEdge[]> {
    const db = this.getDb();
    const rows = await db.all('SELECT * FROM edges');
    return rows.map((row) => this.mapRowToEdge(row));
  }

  // --- File hashes ---

  async getFileHash(filePath: string): Promise<string | null> {
    const db = this.getDb();
    const rows = await db.all('SELECT hash FROM file_hashes WHERE file_path = ?', filePath);
    if (rows.length === 0) return null;
    return rows[0].hash as string;
  }

  async setFileHash(filePath: string, hash: string, sizeBytes: number): Promise<void> {
    const db = this.getDb();
    await db.run(
      'INSERT OR REPLACE INTO file_hashes (file_path, hash, size_bytes) VALUES (?, ?, ?)',
      filePath,
      hash,
      sizeBytes,
    );
  }

  async removeFileHash(filePath: string): Promise<void> {
    const db = this.getDb();
    await db.run('DELETE FROM file_hashes WHERE file_path = ?', filePath);
  }

  async getAllTrackedPaths(): Promise<string[]> {
    const db = this.getDb();
    const rows = await db.all('SELECT file_path FROM file_hashes ORDER BY file_path');
    return rows.map((row) => row.file_path as string);
  }

  // --- Analysis runs ---

  async recordAnalysisRun(run: AnalysisRun): Promise<void> {
    const db = this.getDb();
    await db.run(
      `INSERT OR REPLACE INTO analysis_runs (id, started_at, completed_at, trigger, files_analyzed, nodes_created, nodes_updated, nodes_deleted, edges_created, edges_deleted, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      run.id,
      run.startedAt,
      run.completedAt,
      run.trigger,
      run.filesAnalyzed,
      run.nodesCreated,
      run.nodesUpdated,
      run.nodesDeleted,
      run.edgesCreated,
      run.edgesDeleted,
      run.status,
    );
  }

  async getLastAnalysisRun(): Promise<AnalysisRun | null> {
    const db = this.getDb();
    const rows = await db.all('SELECT * FROM analysis_runs ORDER BY started_at DESC LIMIT 1');
    if (rows.length === 0) return null;
    return this.mapRowToAnalysisRun(rows[0]);
  }

  // --- Row mappers ---

  private mapRowToNode(row: Record<string, unknown>): StoredNode {
    return {
      id: row.id as string,
      type: row.type as NodeType,
      level: row.level as GraphLevel,
      qualifiedName: row.qualified_name as string,
      shortName: row.short_name as string,
      filePath: row.file_path as string | null,
      startLine: row.start_line as number | null,
      endLine: row.end_line as number | null,
      contentHash: row.content_hash as string | null,
      isStale: row.is_stale as boolean,
      lastAnalyzedAt: row.last_analyzed_at as string,
      metadata: JSON.parse(row.metadata as string) as Record<string, unknown>,
    };
  }

  private mapRowToEdge(row: Record<string, unknown>): StoredEdge {
    return {
      id: row.id as string,
      source: row.source as string,
      target: row.target as string,
      type: row.type as EdgeType,
      level: row.level as GraphLevel,
      weight: row.weight as number,
      metadata: JSON.parse(row.metadata as string) as Record<string, unknown>,
    };
  }

  private mapRowToAnalysisRun(row: Record<string, unknown>): AnalysisRun {
    return {
      id: row.id as string,
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string | null,
      trigger: row.trigger as AnalysisRun['trigger'],
      filesAnalyzed: row.files_analyzed as number,
      nodesCreated: row.nodes_created as number,
      nodesUpdated: row.nodes_updated as number,
      nodesDeleted: row.nodes_deleted as number,
      edgesCreated: row.edges_created as number,
      edgesDeleted: row.edges_deleted as number,
      status: row.status as AnalysisRun['status'],
    };
  }
}

#!/usr/bin/env node
import { join } from 'node:path';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { startStdioServer } from './server.js';

const projectDir = process.argv[2] || process.cwd();
const dbPath = join(projectDir, '.contextualizer', 'graph.duckdb');

const store = new DuckDBGraphStore(dbPath);
await store.initialize();
await startStdioServer(store, projectDir);

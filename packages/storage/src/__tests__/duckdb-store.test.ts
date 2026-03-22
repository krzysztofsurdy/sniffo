import { describe } from 'vitest';
import { DuckDBGraphStore } from '../duckdb-store.js';
import { graphStoreContractTests } from './graph-store.contract.test.js';

describe('DuckDBGraphStore', () => {
  graphStoreContractTests(
    async () => new DuckDBGraphStore(':memory:'),
    async (store) => { await (store as DuckDBGraphStore).close(); },
  );
});

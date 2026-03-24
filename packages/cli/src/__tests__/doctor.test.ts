import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDoctor, type DoctorResult } from '../commands/doctor.js';

describe('sniffo doctor', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-doc-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports missing .sniffo directory', async () => {
    const result = await runDoctor(tempDir);
    expect(result.checks.find(c => c.name === 'sniffo-dir')!.status).toBe('fail');
  });

  it('reports missing database', async () => {
    mkdirSync(join(tempDir, '.sniffo'), { recursive: true });
    writeFileSync(join(tempDir, '.sniffo', 'config.json'), '{}');
    const result = await runDoctor(tempDir);
    expect(result.checks.find(c => c.name === 'database')!.status).toBe('fail');
  });

  it('reports all green for a fully initialized project', async () => {
    mkdirSync(join(tempDir, '.sniffo'), { recursive: true });
    writeFileSync(join(tempDir, '.sniffo', 'config.json'), JSON.stringify({ version: 1 }));
    writeFileSync(join(tempDir, '.sniffo', 'graph.duckdb'), '');
    mkdirSync(join(tempDir, '.git', 'hooks'), { recursive: true });
    writeFileSync(join(tempDir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nsniffo update');

    const result = await runDoctor(tempDir);
    expect(result.checks.find(c => c.name === 'sniffo-dir')!.status).toBe('pass');
    expect(result.checks.find(c => c.name === 'config')!.status).toBe('pass');
    expect(result.checks.find(c => c.name === 'database')!.status).toBe('pass');
    expect(result.checks.find(c => c.name === 'hook')!.status).toBe('pass');
  });
});

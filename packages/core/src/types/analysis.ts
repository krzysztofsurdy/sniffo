export interface AnalysisOptions {
  rootDir: string;
  files?: string[];
  skipEmbeddings?: boolean;
  concurrency?: number;
  timeout?: number;
}

export interface AnalysisResult {
  filesScanned: number;
  filesAnalyzed: number;
  filesSkipped: number;
  filesFailed: number;
  symbolsFound: number;
  referencesFound: number;
  durationMs: number;
  errors: AnalysisError[];
}

export interface AnalysisError {
  phase: 'scan' | 'parse' | 'resolve' | 'cluster' | 'embed';
  filePath: string | null;
  message: string;
  recoverable: boolean;
}

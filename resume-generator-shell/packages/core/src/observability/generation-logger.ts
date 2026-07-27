export interface GenerationLogEntry {
  event: string;
  generationId?: string;
  status?: string;
  durationMs?: number;
  details?: Readonly<Record<string, unknown>>;
}

export interface GenerationLogger {
  info(entry: GenerationLogEntry): void;
  error(entry: GenerationLogEntry): void;
}

export class ConsoleGenerationLogger implements GenerationLogger {
  info(entry: GenerationLogEntry): void {
    console.info(JSON.stringify({ level: "info", ...entry }));
  }

  error(entry: GenerationLogEntry): void {
    console.error(JSON.stringify({ level: "error", ...entry }));
  }
}

export class SilentGenerationLogger implements GenerationLogger {
  info(): void {}
  error(): void {}
}

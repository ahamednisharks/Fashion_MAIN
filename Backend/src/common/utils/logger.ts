/* Minimal structured console logger. Silent during tests. */

const silent = process.env['NODE_ENV'] === 'test';

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string, extra?: unknown): void {
  if (silent) {
    return;
  }
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${message}`;
  const stream = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  if (extra === undefined) {
    stream(line);
  } else {
    stream(line, extra);
  }
}

export const logger = {
  info: (message: string, extra?: unknown) => write('INFO', message, extra),
  warn: (message: string, extra?: unknown) => write('WARN', message, extra),
  error: (message: string, extra?: unknown) => write('ERROR', message, extra),
};

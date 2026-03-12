export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
    private level: number;

    constructor() {
        const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
        this.level = LEVELS[envLevel] ?? LEVELS.info;
    }

    private log(level: LogLevel, message: string) {
        if (LEVELS[level] < this.level) return;
        const ts = new Date().toISOString();
        const prefix = `[${ts}] ${level.toUpperCase()}:`;
        if (level === 'error') console.error(prefix, message);
        else if (level === 'warn') console.warn(prefix, message);
        else console.log(prefix, message);
    }

    debug(msg: string) { this.log('debug', msg); }
    info(msg: string) { this.log('info', msg); }
    warn(msg: string) { this.log('warn', msg); }
    error(msg: string) { this.log('error', msg); }
}

export const logger = new Logger();

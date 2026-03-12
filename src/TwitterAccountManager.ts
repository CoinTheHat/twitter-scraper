import { config } from './config';
import { logger } from './logger';
import { execFile } from 'child_process';
import util from 'util';

const execFileAsync = util.promisify(execFile);

export interface TwitterAccount {
    authToken: string;
    ct0: string;
    index: number;
    userAgent: string;
    proxy?: string;
    isBusy: boolean;
    lastBusyStart: number;
    cooldownUntil: number;
    isRateLimited: boolean;
    searchCount: number;
    lastWarmup: number;
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux i686; rv:109.0) Gecko/20100101 Firefox/121.0'
];

const DEADLOCK_TIMEOUT_MS = 180_000;     // 3 minutes
const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const BATCH_REST_COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes (every 10 searches)
const STANDARD_COOLDOWN_MS = 2 * 60 * 1000;    // 2 minutes

export interface AccountManagerOptions {
    /** Override cooldown after rate limit (ms). Default: 15min */
    rateLimitCooldownMs?: number;
    /** Override standard cooldown between searches (ms). Default: 2min */
    standardCooldownMs?: number;
    /** Override batch rest cooldown (every N searches) (ms). Default: 5min */
    batchRestCooldownMs?: number;
    /** Number of searches before batch rest. Default: 10 */
    batchRestInterval?: number;
}

export class TwitterAccountManager {
    private accounts: TwitterAccount[] = [];
    private currentIndex: number = 0;
    private rateLimitCooldown: number;
    private standardCooldown: number;
    private batchRestCooldown: number;
    private batchRestInterval: number;

    constructor(options?: AccountManagerOptions) {
        this.rateLimitCooldown = options?.rateLimitCooldownMs ?? RATE_LIMIT_COOLDOWN_MS;
        this.standardCooldown = options?.standardCooldownMs ?? STANDARD_COOLDOWN_MS;
        this.batchRestCooldown = options?.batchRestCooldownMs ?? BATCH_REST_COOLDOWN_MS;
        this.batchRestInterval = options?.batchRestInterval ?? 10;
        this.loadAccounts();
    }

    private loadAccounts() {
        const tokens = config.TWITTER_AUTH_TOKENS || [];
        const ct0s = config.TWITTER_CT0S || [];
        const proxies = config.TWITTER_PROXIES || [];
        const foundAccounts: TwitterAccount[] = [];

        // 1. Comma-separated lists (TWITTER_AUTH_TOKENS / TWITTER_CT0S)
        const legacyCount = Math.min(tokens.length, ct0s.length);
        for (let i = 0; i < legacyCount; i++) {
            foundAccounts.push(this.createAccount(tokens[i], ct0s[i], i, proxies[i]));
        }

        // 2. Numbered env vars (TWITTER_AUTH_TOKEN_1, TWITTER_CT0_1, ...)
        for (const key of Object.keys(process.env)) {
            if (/^TWITTER_AUTH_TOKEN_\d+$/.test(key)) {
                const suffix = key.split('_').pop()!;
                const authToken = process.env[key]!;
                const ct0 = process.env[`TWITTER_CT0_${suffix}`];
                if (authToken && ct0) {
                    const isDuplicate = foundAccounts.some(a => a.authToken === authToken);
                    if (!isDuplicate) {
                        foundAccounts.push(this.createAccount(authToken, ct0, foundAccounts.length));
                    }
                }
            }
        }

        // 3. Single legacy token (TWITTER_AUTH_TOKEN / TWITTER_CT0)
        if (foundAccounts.length === 0 && config.TWITTER_AUTH_TOKEN) {
            if (config.TWITTER_AUTH_TOKEN.includes(',')) {
                const tks = config.TWITTER_AUTH_TOKEN.split(',').map(t => t.trim()).filter(t => t);
                const cts = (config.TWITTER_CT0 || '').split(',').map(t => t.trim()).filter(t => t);
                const count = Math.min(tks.length, cts.length);
                for (let i = 0; i < count; i++) {
                    foundAccounts.push(this.createAccount(tks[i], cts[i], i, proxies[i]));
                }
            } else {
                foundAccounts.push(this.createAccount(config.TWITTER_AUTH_TOKEN, config.TWITTER_CT0, 0));
            }
        }

        this.accounts = foundAccounts;
        logger.info(`[TwitterManager] Loaded ${this.accounts.length} account(s).`);
    }

    private createAccount(authToken: string, ct0: string, index: number, proxy?: string): TwitterAccount {
        return {
            authToken, ct0, index,
            userAgent: USER_AGENTS[index % USER_AGENTS.length],
            proxy: proxy || undefined,
            isBusy: false,
            lastBusyStart: 0,
            cooldownUntil: 0,
            isRateLimited: false,
            searchCount: 0,
            lastWarmup: 0
        };
    }

    /**
     * Returns the next available account (marks it busy).
     * Handles deadlock detection, pool exhaustion, and cooldown bypass.
     */
    getAvailableAccount(): TwitterAccount | null {
        if (this.accounts.length === 0) return null;

        const now = Date.now();

        // Deadlock detection
        for (const acc of this.accounts) {
            if (acc.isBusy && acc.lastBusyStart > 0 && now - acc.lastBusyStart > DEADLOCK_TIMEOUT_MS) {
                logger.warn(`[TwitterManager] Deadlock detected on Account #${acc.index + 1}. Force releasing.`);
                acc.isBusy = false;
                acc.lastBusyStart = 0;
                acc.cooldownUntil = now + 5000;
            }
        }

        // Round-robin: find first available
        for (let i = 0; i < this.accounts.length; i++) {
            const ptr = (this.currentIndex + i) % this.accounts.length;
            const account = this.accounts[ptr];
            if (!account.isBusy && now > account.cooldownUntil) {
                this.currentIndex = (ptr + 1) % this.accounts.length;
                account.isBusy = true;
                account.lastBusyStart = Date.now();
                return account;
            }
        }

        // Fallback: force release oldest busy account
        let oldest: TwitterAccount | null = null;
        for (const acc of this.accounts) {
            if (acc.isBusy && (!oldest || acc.lastBusyStart < oldest.lastBusyStart)) {
                oldest = acc;
            }
        }
        if (oldest) {
            logger.warn(`[TwitterManager] Pool exhausted. Forcing turnover of Account #${oldest.index + 1}.`);
            oldest.isBusy = true;
            oldest.lastBusyStart = Date.now();
            return oldest;
        }

        // All on cooldown: pick nearest non-rate-limited
        let nearest: TwitterAccount | null = null;
        for (const acc of this.accounts) {
            if (!acc.isRateLimited && (!nearest || acc.cooldownUntil < nearest.cooldownUntil)) {
                nearest = acc;
            }
        }
        if (nearest) {
            logger.warn(`[TwitterManager] Pool depleted. Early releasing Account #${nearest.index + 1}.`);
            nearest.isBusy = true;
            nearest.lastBusyStart = Date.now();
            return nearest;
        }

        logger.error('[TwitterManager] No accounts available (all rate-limited).');
        return null;
    }

    /**
     * Releases an account back to the pool.
     */
    releaseAccount(index: number, wasRateLimited: boolean) {
        const account = this.accounts.find(a => a.index === index);
        if (!account) return;

        account.isBusy = false;
        account.lastBusyStart = 0;
        account.isRateLimited = wasRateLimited;
        account.searchCount++;

        if (wasRateLimited) {
            account.cooldownUntil = Date.now() + this.rateLimitCooldown;
            logger.warn(`[TwitterManager] Account #${index + 1} rate-limited. Resting ${this.rateLimitCooldown / 60000}m.`);
        } else if (account.searchCount > 0 && account.searchCount % this.batchRestInterval === 0) {
            account.cooldownUntil = Date.now() + this.batchRestCooldown;
            logger.info(`[TwitterManager] Account #${index + 1} completed ${this.batchRestInterval} searches. Resting ${this.batchRestCooldown / 60000}m.`);
        } else {
            account.cooldownUntil = Date.now() + this.standardCooldown;
        }
    }

    /** Reset all account locks. Call on startup. */
    resetAllLocks() {
        for (const acc of this.accounts) {
            acc.isBusy = false;
            acc.lastBusyStart = 0;
            acc.cooldownUntil = 0;
            acc.isRateLimited = false;
        }
        logger.info(`[TwitterManager] Reset all ${this.accounts.length} account locks.`);
    }

    /** Number of loaded accounts */
    getAccountCount(): number {
        return this.accounts.length;
    }

    /** Warm up an account by fetching a random popular profile */
    async performWarmup(account: TwitterAccount): Promise<void> {
        const profiles = ['elonmusk', 'NASA', 'Google', 'BBCBreaking', 'nytimes'];
        const pick = profiles[Math.floor(Math.random() * profiles.length)];

        try {
            logger.info(`[Warmup] Warming up Account #${account.index + 1}...`);

            const safeUsername = pick.replace(/[^a-zA-Z0-9_]/g, '');
            const env: Record<string, string> = {
                PATH: process.env.PATH || '',
                HOME: process.env.HOME || process.env.USERPROFILE || '',
                AUTH_TOKEN: account.authToken,
                CT0: account.ct0
            };
            if (account.proxy) {
                env.HTTP_PROXY = account.proxy;
                env.HTTPS_PROXY = account.proxy;
            }

            await execFileAsync('npx', ['@steipete/bird', 'user', safeUsername, '--json'], { env, timeout: 10000 });

            account.lastWarmup = Date.now();
            account.searchCount = 0;
            logger.info(`[Warmup] Account #${account.index + 1} warm-up complete.`);
        } catch (err) {
            logger.warn(`[Warmup] Failed for Account #${account.index + 1}: ${err}`);
        }
    }
}

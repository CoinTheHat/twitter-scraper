import { execFile } from 'child_process';
import util from 'util';
import { logger } from './logger';
import { TwitterAccountManager, TwitterAccount } from './TwitterAccountManager';
import { QueryBuilder } from './QueryBuilder';

const execFileAsync = util.promisify(execFile);

export interface Tweet {
    id: string;
    text: string;
    author: {
        name: string;
        screen_name: string;
        avatar?: string;
        followers?: number;
    };
    created_at: string;
    views?: number;
    likes?: number;
    retweets?: number;
    url: string;
}

export class BirdService {
    private accountManager: TwitterAccountManager;

    constructor(accountManager: TwitterAccountManager) {
        this.accountManager = accountManager;
    }

    /**
     * Search tweets with automatic fallback through multiple query tiers.
     * Tries cashtag first, then name+context, symbol+context, and finally contract address.
     */
    async searchWithFallback(token: { symbol: string; name: string; mint?: string }, limit: number = 20): Promise<Tweet[]> {
        const queries = QueryBuilder.build(token.name, token.symbol, token.mint);

        for (let i = 0; i < queries.length; i++) {
            const results = await this.search(queries[i], limit);
            if (results.length > 0) {
                if (i > 0) logger.info(`[Bird] Fallback success on Tier ${i + 1} (${queries[i]}) -> ${results.length} tweets`);
                return results;
            }
        }

        logger.warn(`[Bird] All query tiers failed for ${token.symbol}. No tweets found.`);
        return [];
    }

    /**
     * Execute a single tweet search query.
     *
     * @param query - Search query string
     * @param limit - Max tweets to return
     * @param explicitAccount - Optional: use a specific account instead of auto-selecting
     */
    async search(query: string, limit: number = 20, explicitAccount?: TwitterAccount): Promise<Tweet[]> {
        const account = explicitAccount || this.accountManager.getAvailableAccount();

        if (!account) {
            logger.warn('[Bird] No Twitter accounts available. Skipping search.');
            return [];
        }

        let released = false;

        try {
            // Warmup check (every 50 searches, if >30min since last warmup)
            if (account.searchCount >= 50 && Date.now() - account.lastWarmup > 30 * 60 * 1000) {
                await this.accountManager.performWarmup(account);
            }

            account.searchCount++;

            const env: Record<string, string> = {
                ...process.env as Record<string, string>,
                AUTH_TOKEN: account.authToken,
                CT0: account.ct0
            };

            if (account.proxy) {
                env.HTTP_PROXY = account.proxy;
                env.HTTPS_PROXY = account.proxy;
            }

            const args = ['@steipete/bird', 'search', query, '--count', String(limit), '--json'];

            logger.info(`[Bird] Searching: "${query}" (Account #${account.index + 1})`);
            const { stdout } = await execFileAsync('npx', args, { env, timeout: 10000 });

            try {
                const rawData = JSON.parse(stdout);

                if (!Array.isArray(rawData)) {
                    logger.warn(`[Bird] Unexpected JSON structure: ${stdout.substring(0, 200)}`);
                    return [];
                }

                return rawData.map((t: any) => {
                    const rawUser = t._raw?.core?.user_results?.result?.legacy || t.author;
                    const avatar = rawUser?.profile_image_url_https || t.author?.profile_image_url || '';

                    return {
                        id: t.id,
                        text: t.text,
                        author: {
                            name: t.author?.name || 'Unknown',
                            screen_name: t.author?.username || 'unknown',
                            avatar,
                            followers: rawUser?.followers_count
                        },
                        created_at: t.createdAt,
                        views: t.viewCount || t.views,
                        likes: t.likeCount,
                        retweets: t.retweetCount,
                        url: `https://x.com/${t.author?.username}/status/${t.id}`
                    };
                });

            } catch (jsonErr) {
                logger.error(`[Bird] Failed to parse JSON: ${jsonErr}`);
                return [];
            }

        } catch (err: any) {
            const msg = err.message || err.toString();

            if (msg.includes('401') || msg.includes('403')) {
                logger.error(`[Bird] Auth error on Account #${account.index + 1}`);
                this.accountManager.releaseAccount(account.index, true);
                released = true;
            } else if (msg.includes('Rate limit') || msg.includes('Too Many Requests') || msg.includes('429')) {
                logger.warn(`[Bird] Rate limit hit on Account #${account.index + 1}`);
                this.accountManager.releaseAccount(account.index, true);
                released = true;
            } else {
                logger.error(`[Bird] Error on Account #${account.index + 1}: ${msg}`);
                this.accountManager.releaseAccount(account.index, false);
                released = true;
            }

            return [];
        } finally {
            if (!released && !explicitAccount) {
                this.accountManager.releaseAccount(account.index, false);
            }
        }
    }
}

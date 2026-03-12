import { logger } from './logger';
import { BirdService, Tweet } from './BirdService';
import { TwitterAccountManager, AccountManagerOptions } from './TwitterAccountManager';

export interface ScraperOptions extends AccountManagerOptions {
    /** Max tweets per search. Default: 30 */
    maxTweets?: number;
    /** Max retry attempts. Default: 2 */
    maxRetries?: number;
}

export class TwitterScraper {
    private bird: BirdService;
    private accountManager: TwitterAccountManager;
    private maxTweets: number;
    private maxRetries: number;

    constructor(options?: ScraperOptions) {
        this.accountManager = new TwitterAccountManager(options);
        this.bird = new BirdService(this.accountManager);
        this.maxTweets = options?.maxTweets ?? 30;
        this.maxRetries = options?.maxRetries ?? 2;

        // Clear any ghost locks
        this.accountManager.resetAllLocks();
    }

    /**
     * Search tweets for a token using multi-tier query fallback.
     * Returns full Tweet objects with author info, engagement metrics, etc.
     *
     * @param token - Token to search for
     * @returns Array of Tweet objects
     */
    async searchToken(token: { symbol: string; name: string; mint?: string }): Promise<Tweet[]> {
        const allTweets: Map<string, Tweet> = new Map();
        let attempts = 0;

        while (attempts < this.maxRetries) {
            attempts++;
            try {
                const results = await this.bird.searchWithFallback(token, this.maxTweets);
                for (const tweet of results) {
                    allTweets.set(tweet.id, tweet);
                }
            } catch (e) {
                logger.warn(`[Scraper] Search failed for ${token.symbol}: ${e}`);
            }

            if (allTweets.size > 0) {
                logger.info(`[Scraper] Found ${allTweets.size} tweets for ${token.symbol} on attempt ${attempts}.`);
                break;
            }

            if (attempts < this.maxRetries) {
                logger.warn(`[Scraper] Attempt ${attempts} returned 0 tweets for ${token.symbol}. Retrying...`);
            }
        }

        if (allTweets.size === 0) {
            logger.warn(`[Scraper] No tweets found for ${token.symbol} after ${attempts} attempts.`);
        }

        return Array.from(allTweets.values());
    }

    /**
     * Search tweets with a raw query string.
     *
     * @param query - Raw search query
     * @param limit - Max tweets to return
     * @returns Array of Tweet objects
     */
    async search(query: string, limit?: number): Promise<Tweet[]> {
        return this.bird.search(query, limit ?? this.maxTweets);
    }

    /**
     * Search tweets and return only the text content (simplified output).
     */
    async searchTokenTexts(token: { symbol: string; name: string; mint?: string }): Promise<string[]> {
        const tweets = await this.searchToken(token);
        return tweets.map(t => t.text);
    }

    /** Get the underlying account manager for advanced usage */
    getAccountManager(): TwitterAccountManager {
        return this.accountManager;
    }
}

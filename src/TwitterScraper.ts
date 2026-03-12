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
     * Search tweets with a query string.
     *
     * @param query - Search query (e.g. "bitcoin", "from:elonmusk", "#AI")
     * @param limit - Max tweets to return (overrides default maxTweets)
     * @returns Array of Tweet objects
     */
    async search(query: string, limit?: number): Promise<Tweet[]> {
        const max = limit ?? this.maxTweets;
        let allTweets: Map<string, Tweet> = new Map();
        let attempts = 0;

        while (attempts < this.maxRetries) {
            attempts++;
            try {
                const results = await this.bird.search(query, max);
                for (const tweet of results) {
                    allTweets.set(tweet.id, tweet);
                }
            } catch (e) {
                logger.warn(`[Scraper] Search failed: ${e}`);
            }

            if (allTweets.size > 0) {
                logger.info(`[Scraper] Found ${allTweets.size} tweets on attempt ${attempts}.`);
                break;
            }

            if (attempts < this.maxRetries) {
                logger.warn(`[Scraper] Attempt ${attempts} returned 0 tweets. Retrying...`);
            }
        }

        return Array.from(allTweets.values());
    }

    /**
     * Try multiple queries in order — returns results from the first one that finds tweets.
     * Useful when you have primary + fallback search terms.
     *
     * @param queries - Array of queries to try in order (e.g. ["$BTC", "bitcoin crypto"])
     * @param limit - Max tweets to return
     * @returns Array of Tweet objects from the first successful query
     */
    async searchWithFallback(queries: string[], limit?: number): Promise<Tweet[]> {
        return this.bird.searchWithFallback(queries, limit ?? this.maxTweets);
    }

    /**
     * Search and return only the text content (useful for AI/NLP pipelines).
     */
    async searchTexts(query: string, limit?: number): Promise<string[]> {
        const tweets = await this.search(query, limit);
        return tweets.map(t => t.text);
    }

    /** Get the underlying account manager for advanced usage */
    getAccountManager(): TwitterAccountManager {
        return this.accountManager;
    }
}

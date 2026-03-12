import { logger } from './logger';
import { BirdService, Tweet } from './BirdService';
import { TwitterAccountManager, AccountManagerOptions } from './TwitterAccountManager';

const DEFAULT_SPAM_KEYWORDS = [
    'airdrop', 'giveaway', 'whitelist', 'presale', 'join tg', 'dm for promo',
    'free mint', 'send dm', 'promotion', 'collaborate'
];

export interface ScraperOptions extends AccountManagerOptions {
    /** Max tweets per search. Default: 30 */
    maxTweets?: number;
    /** Max retry attempts. Default: 2 */
    maxRetries?: number;
    /** Custom spam keywords to filter out */
    spamKeywords?: string[];
}

export class TwitterScraper {
    private bird: BirdService;
    private accountManager: TwitterAccountManager;
    private maxTweets: number;
    private maxRetries: number;
    private spamKeywords: string[];

    constructor(options?: ScraperOptions) {
        this.accountManager = new TwitterAccountManager(options);
        this.bird = new BirdService(this.accountManager);
        this.maxTweets = options?.maxTweets ?? 30;
        this.maxRetries = options?.maxRetries ?? 2;
        this.spamKeywords = options?.spamKeywords ?? DEFAULT_SPAM_KEYWORDS;

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
            return [];
        }

        // Filter spam
        const clean = this.filterSpam(Array.from(allTweets.values()));
        const removed = allTweets.size - clean.length;
        if (removed > 0) logger.info(`[Scraper] Filtered ${removed} spam tweets.`);

        return clean;
    }

    /**
     * Search tweets with a raw query string.
     * Useful for free-text searches not tied to a specific token.
     *
     * @param query - Raw search query
     * @param limit - Max tweets to return
     * @returns Array of Tweet objects
     */
    async search(query: string, limit?: number): Promise<Tweet[]> {
        const results = await this.bird.search(query, limit ?? this.maxTweets);
        return this.filterSpam(results);
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

    private filterSpam(tweets: Tweet[]): Tweet[] {
        return tweets.filter(tweet => {
            const lower = tweet.text.toLowerCase();
            return !this.spamKeywords.some(keyword => lower.includes(keyword));
        });
    }
}

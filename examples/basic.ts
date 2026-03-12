import { TwitterScraper } from '../src';

async function main() {
    // Create scraper (reads .env automatically)
    const scraper = new TwitterScraper({
        maxTweets: 20,
        maxRetries: 2,
    });

    // 1. Search by token info
    const tweets = await scraper.searchToken({
        symbol: 'PEPE',
        name: 'Pepe',
        mint: '5z3EqYQo9HiCEs3R84RCDMu2n4anFEVr9TXrXAc7Pump' // optional
    });

    console.log(`\nFound ${tweets.length} tweets:\n`);
    for (const tweet of tweets.slice(0, 5)) {
        console.log(`@${tweet.author.screen_name} (${tweet.author.followers ?? '?'} followers)`);
        console.log(`  ${tweet.text.substring(0, 120)}`);
        console.log(`  likes: ${tweet.likes ?? 0} | retweets: ${tweet.retweets ?? 0} | views: ${tweet.views ?? 0}`);
        console.log(`  ${tweet.url}\n`);
    }

    // 2. Raw query search
    const results = await scraper.search('solana meme coin', 10);
    console.log(`\nRaw search found ${results.length} tweets.`);

    // 3. Get just text (for AI/sentiment analysis)
    const texts = await scraper.searchTokenTexts({ symbol: 'WIF', name: 'dogwifhat' });
    console.log(`\nGot ${texts.length} tweet texts for sentiment analysis.`);
}

main().catch(console.error);

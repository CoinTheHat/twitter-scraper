import { TwitterScraper } from '../src';

async function main() {
    const scraper = new TwitterScraper({
        maxTweets: 20,
        maxRetries: 2,
    });

    // 1. Simple search
    const tweets = await scraper.search('artificial intelligence', 10);

    console.log(`\nFound ${tweets.length} tweets:\n`);
    for (const tweet of tweets.slice(0, 5)) {
        console.log(`@${tweet.author.screen_name} (${tweet.author.followers ?? '?'} followers)`);
        console.log(`  ${tweet.text.substring(0, 120)}`);
        console.log(`  likes: ${tweet.likes ?? 0} | retweets: ${tweet.retweets ?? 0} | views: ${tweet.views ?? 0}`);
        console.log(`  ${tweet.url}\n`);
    }

    // 2. Fallback search — tries queries in order, returns first one with results
    const results = await scraper.searchWithFallback([
        '#OpenAI',           // try hashtag first
        'ChatGPT news',     // then keyword combo
        'AI language model'  // last resort
    ]);
    console.log(`\nFallback search found ${results.length} tweets.`);

    // 3. Get just text (for AI/NLP pipelines)
    const texts = await scraper.searchTexts('from:elonmusk', 5);
    console.log(`\nGot ${texts.length} tweet texts.`);
    texts.forEach(t => console.log(`  - ${t.substring(0, 100)}`));
}

main().catch(console.error);

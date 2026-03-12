# twitter-scraper

Multi-account Twitter/X tweet scraper with automatic rate-limit handling and account rotation.

Uses cookie-based authentication via [@steipete/bird](https://github.com/nicklama/bird-cli) CLI — no official Twitter API key required.

## What Can You Get?

Every tweet returned includes:

| Data | Description |
|------|-------------|
| **Tweet text** | Full tweet content |
| **Author name** | Display name (e.g. "Elon Musk") |
| **Author username** | Handle (e.g. "elonmusk") |
| **Author avatar** | Profile picture URL |
| **Follower count** | Author's follower count |
| **Views** | Tweet view/impression count |
| **Likes** | Like count |
| **Retweets** | Retweet count |
| **Date** | Tweet creation date |
| **Tweet URL** | Direct link to the tweet |
| **Tweet ID** | Unique tweet identifier |

### Use Cases

- **Sentiment analysis** — pull tweets about a topic and feed them to an AI model
- **Trend monitoring** — track what people are saying about any keyword, hashtag, or event
- **Brand monitoring** — search mentions of your brand/product
- **Research** — collect tweets from specific users or about specific topics
- **Engagement analytics** — analyze likes, retweets, views, and follower counts
- **News tracking** — monitor breaking news via hashtags or from news accounts
- **Influencer analysis** — find high-follower authors tweeting about your topic
- **Content curation** — collect tweets for newsletters, dashboards, or reports

## Features

- **Multi-account pool** — rotate across multiple Twitter accounts automatically
- **Rate limit handling** — 15min cooldown on 429, automatic account switching
- **Deadlock detection** — force-releases stuck accounts after 3 minutes
- **Fallback queries** — try multiple search terms in order, use first one with results
- **Warmup** — mimics human behavior to avoid detection
- **Automatic retries** — retries with a different account if first attempt fails

## Quick Start

```bash
cd twitter-scraper
npm install
cp .env.example .env
# Edit .env with your Twitter cookies (see below)
```

### Get Your Twitter Cookies

1. Log into [x.com](https://x.com) in your browser
2. Open DevTools (F12) → Application → Cookies → `https://x.com`
3. Copy the values of `auth_token` and `ct0`
4. Paste them into your `.env` file

### Usage

```typescript
import { TwitterScraper } from './src';

const scraper = new TwitterScraper();

// Simple search
const tweets = await scraper.search('artificial intelligence', 10);

for (const tweet of tweets) {
  console.log(`@${tweet.author.screen_name}: ${tweet.text}`);
  console.log(`  likes: ${tweet.likes} | views: ${tweet.views} | followers: ${tweet.author.followers}`);
}

// Search with fallback queries (tries in order, returns first with results)
const results = await scraper.searchWithFallback([
  '#OpenAI',           // try first
  'ChatGPT news',     // fallback
  'AI language model'  // last resort
]);

// Get just texts (for AI/NLP pipelines)
const texts = await scraper.searchTexts('from:elonmusk', 5);
```

### Run the Example

```bash
npx ts-node examples/basic.ts
```

## Configuration

All config is via environment variables (`.env` file supported):

| Variable | Description |
|----------|-------------|
| `TWITTER_AUTH_TOKEN` | Single account auth_token cookie |
| `TWITTER_CT0` | Single account ct0 cookie |
| `TWITTER_AUTH_TOKENS` | Multiple accounts, comma-separated |
| `TWITTER_CT0S` | Multiple ct0s, comma-separated |
| `TWITTER_AUTH_TOKEN_1`, `_2`... | Numbered account tokens |
| `TWITTER_CT0_1`, `_2`... | Numbered account ct0s |
| `TWITTER_PROXIES` | Comma-separated proxy URLs (optional) |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` |

## API

### `TwitterScraper`

```typescript
const scraper = new TwitterScraper({
  maxTweets: 30,        // tweets per search (default: 30)
  maxRetries: 2,        // retry attempts (default: 2)

  // Account pool tuning
  rateLimitCooldownMs: 15 * 60 * 1000,  // 15min (default)
  standardCooldownMs: 2 * 60 * 1000,    // 2min (default)
  batchRestCooldownMs: 5 * 60 * 1000,   // 5min every N searches
  batchRestInterval: 10,                 // rest every 10 searches
});
```

**Methods:**

| Method | Description |
|--------|-------------|
| `search(query, limit?)` | Search tweets with any query |
| `searchWithFallback(queries[], limit?)` | Try queries in order, return first with results |
| `searchTexts(query, limit?)` | Same as search but returns only tweet texts |
| `getAccountManager()` | Access account manager for advanced usage |

### `Tweet` object

```typescript
interface Tweet {
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
```

### Search Query Examples

```typescript
// Keywords
await scraper.search('bitcoin price prediction');

// Hashtags
await scraper.search('#AI #machinelearning');

// From specific user
await scraper.search('from:elonmusk');

// Mentions
await scraper.search('@openai');

// Exclude retweets
await scraper.search('ChatGPT -filter:retweets');

// Minimum engagement
await scraper.search('typescript min_faves:100');

// Combine anything
await scraper.search('from:naval investing -filter:retweets min_faves:50');

// Date range
await scraper.search('AI since:2025-01-01 until:2025-06-01');

// Language filter
await scraper.search('machine learning lang:en');

// Near a location
await scraper.search('concert near:london within:15mi');

// Only tweets with links
await scraper.search('startup funding filter:links');

// Only tweets with media
await scraper.search('landscape photography filter:media');
```

## Multiple Accounts

For sustained scraping, use multiple accounts. The pool manager handles:

- **Round-robin rotation** across accounts
- **2min rest** between uses per account
- **5min rest** every 10 searches per account
- **15min cooldown** on rate limit (429)
- **Deadlock protection** — auto-releases after 3min

```env
TWITTER_AUTH_TOKENS=token_acct1,token_acct2,token_acct3
TWITTER_CT0S=ct0_acct1,ct0_acct2,ct0_acct3
TWITTER_PROXIES=http://proxy1:8080,http://proxy2:8080,http://proxy3:8080
```

## Security

- **No env leakage** — only `PATH`, `HOME`, and auth credentials are passed to the subprocess. Your other environment variables (database URLs, API keys, etc.) are never exposed.
- **No shell injection** — all subprocess calls use `execFile` with argument arrays, not `exec` with string interpolation. Query strings cannot execute shell commands.
- **Credentials stay local** — `.env` is in `.gitignore` by default. Never commit your cookies.
- **Cookie rotation** — if a cookie gets rate-limited or banned, only that account is affected. Others continue working.

### Best Practices

- Use a **dedicated Twitter account** for scraping, not your main account
- **Rotate cookies** periodically — they can expire or get invalidated
- Use **proxies** if you're doing high-volume scraping to avoid IP-based rate limits
- Keep your `.env` file out of version control (already in `.gitignore`)

## License

MIT

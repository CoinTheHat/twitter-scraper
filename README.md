# twitter-scraper

Multi-account Twitter/X tweet scraper with automatic rate-limit handling and account rotation.

Uses cookie-based authentication via [@steipete/bird](https://github.com/nicklama/bird-cli) CLI — no official Twitter API key required.

## Features

- **Multi-account pool** — rotate across multiple Twitter accounts automatically
- **Rate limit handling** — 15min cooldown on 429, automatic account switching
- **Deadlock detection** — force-releases stuck accounts after 3 minutes
- **Multi-tier query fallback** — tries `$SYMBOL` → `"Name" solana` → `SYMBOL solana` → contract address
- **Warmup** — mimics human behavior to avoid detection

## Quick Start

```bash
cd twitter-scraper
npm install
cp .env.example .env
# Edit .env with your Twitter cookies (see below)
```

### Get Your Twitter Cookies

1. Log into [x.com](https://x.com) in your browser
2. Open DevTools → Application → Cookies → `https://x.com`
3. Copy `auth_token` and `ct0` values
4. Paste them into `.env`

### Usage

```typescript
import { TwitterScraper } from './src';

const scraper = new TwitterScraper();

// Search by token
const tweets = await scraper.searchToken({
  symbol: 'PEPE',
  name: 'Pepe',
  mint: '5z3EqYQo9HiCEs3R84RCDMu...' // optional
});

// Raw query
const results = await scraper.search('solana meme coin', 10);

// Just texts (for AI/sentiment)
const texts = await scraper.searchTokenTexts({ symbol: 'WIF', name: 'dogwifhat' });
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

### `QueryBuilder`

Build search queries manually:

```typescript
import { QueryBuilder } from './src';

const queries = QueryBuilder.build('Pepe', 'PEPE', 'mint_address');
// => ['$PEPE', '"Pepe" solana', 'PEPE solana', '5z3EqYQo']

const custom = QueryBuilder.fromKeywords('bitcoin', 'ETF', 'approval');
// => ['bitcoin', 'ETF', 'approval']
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

## License

MIT

import dotenv from 'dotenv';
dotenv.config();

export const config = {
    TWITTER_AUTH_TOKEN: process.env.TWITTER_AUTH_TOKEN || '',
    TWITTER_CT0: process.env.TWITTER_CT0 || '',
    TWITTER_AUTH_TOKENS: (process.env.TWITTER_AUTH_TOKENS || '').split(',').map(t => t.trim()).filter(t => t),
    TWITTER_CT0S: (process.env.TWITTER_CT0S || '').split(',').map(t => t.trim()).filter(t => t),
    TWITTER_PROXIES: (process.env.TWITTER_PROXIES || '').split(',').map(t => t.trim()).filter(t => t),
};

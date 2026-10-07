// Sample X archive contents shared by unit and e2e tests.

// A real-format tweet ID: 1050118621198921728 = 2018-10-10T20:19:24Z
export const MODERN_ID = '1050118621198921728';

export const ARCHIVE_FILES = {
  'data/account.js': `window.YTD.account.part0 = [{"account":{"accountId":"42","username":"tester"}}]`,
  'data/tweets.js': `window.YTD.tweets.part0 = ${JSON.stringify([
    { tweet: { id_str: '111', created_at: 'Wed Oct 10 20:19:24 +0000 2018', full_text: 'hello world', favorite_count: '5', retweet_count: '1' } },
    { tweet: { id_str: '222', created_at: 'Mon Jan 02 10:00:00 +0000 2017', full_text: '@bob agreed', in_reply_to_status_id_str: '9', favorite_count: '0' } },
  ])}`,
  'data/tweets-part1.js': `window.YTD.tweets.part1 = ${JSON.stringify([
    { tweet: { id_str: '333', created_at: 'Sun Mar 05 08:00:00 +0000 2016', full_text: 'RT @alice: great', favorite_count: '0', extended_entities: { media: [{ media_url_https: 'https://pbs.twimg.com/a.jpg' }] } } },
  ])}`,
  'data/like.js': `window.YTD.like.part0 = ${JSON.stringify([{ like: { tweetId: MODERN_ID, fullText: 'a liked post', expandedUrl: `https://x.com/i/web/status/${MODERN_ID}` } }])}`,
  'data/tweets_media/big.jpg': 'x'.repeat(1000),
};


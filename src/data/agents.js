// Known automated clients: the single source of truth for user-agent tokens, verification methods
// and published IP lists. Order matters: the first matching entry wins, so specific tokens come
// before generic ones.
//
// Sources (accessed 2026-11): vendor docs linked in `info`, Cloudflare's bot reference
// (https://developers.cloudflare.com/ai-crawl-control/reference/bots), the ai.robots.txt project
// (https://github.com/ai-robots-txt/ai.robots.txt) and monperrus/crawler-user-agents.
// User agents change; treat this list as maintained data, not code.

/** Published IP range lists ({prefixes:[{ipv4Prefix|ipv6Prefix}]} format). */
export const IP_LISTS = Object.freeze({
  googlebot: 'https://developers.google.com/static/search/apis/ipranges/googlebot.json',
  bingbot: 'https://www.bing.com/toolbox/bingbot.json',
  gptbot: 'https://openai.com/gptbot.json',
  'oai-searchbot': 'https://openai.com/searchbot.json',
  'chatgpt-user': 'https://openai.com/chatgpt-user.json',
  perplexitybot: 'https://www.perplexity.com/perplexitybot.json',
  'perplexity-user': 'https://www.perplexity.com/perplexity-user.json',
});

const a = (id, name, operator, category, ua, extra = {}) => ({ id, name, operator, category, ua, ...extra });

export const AGENTS = Object.freeze([
  // --- AI: user-triggered fetchers (a person asked an assistant something) ---
  a('chatgpt-user', 'ChatGPT-User', 'OpenAI', 'ai_user_fetcher', /ChatGPT-User/i, { verify: { ipList: 'chatgpt-user' }, info: 'https://platform.openai.com/docs/bots' }),
  a('claude-code', 'Claude Code (WebFetch)', 'Anthropic', 'ai_user_fetcher', /claude-code/i),
  a('claude-user', 'Claude-User', 'Anthropic', 'ai_user_fetcher', /Claude-User/i, { info: 'https://support.claude.com/en/articles/8896518' }),
  a('perplexity-user', 'Perplexity-User', 'Perplexity', 'ai_user_fetcher', /Perplexity-User/i, { verify: { ipList: 'perplexity-user' }, info: 'https://docs.perplexity.ai/guides/bots' }),
  a('mistralai-user', 'MistralAI-User', 'Mistral AI', 'ai_user_fetcher', /MistralAI-User/i),
  a('meta-externalfetcher', 'Meta-ExternalFetcher', 'Meta', 'ai_user_fetcher', /Meta-ExternalFetcher/i),
  a('duckassistbot', 'DuckAssistBot', 'DuckDuckGo', 'ai_user_fetcher', /DuckAssistBot/i),
  a('google-agent', 'Google user-triggered fetcher', 'Google', 'ai_user_fetcher', /Google-(?:Agent|NotebookLM|Read-Aloud)/i),
  a('cohere-ai', 'cohere-ai', 'Cohere', 'ai_user_fetcher', /cohere-ai/i),

  // --- AI: search indexers ---
  a('oai-searchbot', 'OAI-SearchBot', 'OpenAI', 'ai_search', /OAI-SearchBot/i, { verify: { ipList: 'oai-searchbot' }, info: 'https://platform.openai.com/docs/bots' }),
  a('claude-searchbot', 'Claude-SearchBot', 'Anthropic', 'ai_search', /Claude-SearchBot/i),
  a('perplexitybot', 'PerplexityBot', 'Perplexity', 'ai_search', /PerplexityBot/i, { verify: { ipList: 'perplexitybot' }, info: 'https://docs.perplexity.ai/guides/bots' }),
  a('youbot', 'YouBot', 'You.com', 'ai_search', /YouBot/i),
  a('phindbot', 'PhindBot', 'Phind', 'ai_search', /PhindBot/i),

  // --- AI: training crawlers ---
  a('gptbot', 'GPTBot', 'OpenAI', 'ai_training', /GPTBot/i, { verify: { ipList: 'gptbot' }, info: 'https://platform.openai.com/docs/bots' }),
  a('claudebot', 'ClaudeBot', 'Anthropic', 'ai_training', /ClaudeBot|anthropic-ai|Claude-Web/i, { info: 'https://support.claude.com/en/articles/8896518' }),
  a('ccbot', 'CCBot', 'Common Crawl', 'ai_training', /CCBot/i),
  a('bytespider', 'Bytespider', 'ByteDance', 'ai_training', /Bytespider/i),
  a('meta-externalagent', 'Meta-ExternalAgent', 'Meta', 'ai_training', /meta-externalagent/i),
  a('applebot-ai', 'Applebot (AI)', 'Apple', 'ai_training', /Applebot-Extended/i),
  a('amazonbot', 'Amazonbot', 'Amazon', 'ai_training', /Amazonbot/i, { verify: { rdns: ['.crawl.amazonbot.amazon'] } }),
  a('cohere-crawler', 'cohere-training-data-crawler', 'Cohere', 'ai_training', /cohere-training-data-crawler/i),
  a('ai2bot', 'AI2Bot', 'Allen Institute for AI', 'ai_training', /AI2Bot/i),
  a('diffbot', 'Diffbot', 'Diffbot', 'ai_training', /Diffbot/i),
  a('timpibot', 'Timpibot', 'Timpi', 'ai_training', /Timpibot/i),
  a('imagesiftbot', 'ImagesiftBot', 'ImageSift', 'ai_training', /ImagesiftBot/i),
  a('omgili', 'omgili', 'Webz.io', 'ai_training', /omgili/i),
  a('petalbot', 'PetalBot', 'Huawei', 'ai_training', /PetalBot/i),

  // --- AI: retrieval APIs (pages -> LLM input for third-party apps) ---
  a('firecrawl', 'Firecrawl', 'Firecrawl', 'ai_retrieval', /Firecrawl/i),
  a('exabot', 'Exa', 'Exa', 'ai_retrieval', /ExaBot/i),
  a('jina', 'Jina Reader', 'Jina AI', 'ai_retrieval', /Jina(?:Bot|-Reader)?\b/i),
  a('crawl4ai', 'Crawl4AI', 'open source', 'ai_retrieval', /Crawl4AI/i),
  a('tavily', 'Tavily', 'Tavily', 'ai_retrieval', /Tavily/i),

  // --- Search engines ---
  a('googlebot', 'Googlebot', 'Google', 'search_crawler', /Googlebot|Google-InspectionTool|AdsBot-Google|Storebot-Google|GoogleOther/i, { verify: { ipList: 'googlebot', rdns: ['.googlebot.com', '.google.com'] }, info: 'https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot' }),
  a('bingbot', 'Bingbot', 'Microsoft', 'search_crawler', /bingbot|BingPreview|msnbot/i, { verify: { ipList: 'bingbot', rdns: ['.search.msn.com'] } }),
  a('applebot', 'Applebot', 'Apple', 'search_crawler', /Applebot/i, { verify: { rdns: ['.applebot.apple.com'] } }),
  a('yandexbot', 'YandexBot', 'Yandex', 'search_crawler', /Yandex(?:Bot|Images|Mobile)/i, { verify: { rdns: ['.yandex.ru', '.yandex.net', '.yandex.com'] } }),
  a('baiduspider', 'Baiduspider', 'Baidu', 'search_crawler', /Baiduspider/i, { verify: { rdns: ['.baidu.com', '.baidu.jp'] } }),
  a('duckduckbot', 'DuckDuckBot', 'DuckDuckGo', 'search_crawler', /DuckDuckBot/i),
  a('yahoo', 'Yahoo Slurp', 'Yahoo', 'search_crawler', /Yahoo! Slurp/i, { verify: { rdns: ['.crawl.yahoo.net'] } }),
  a('seznam', 'SeznamBot', 'Seznam', 'search_crawler', /SeznamBot/i),
  a('qwant', 'Qwantbot', 'Qwant', 'search_crawler', /Qwant(?:bot|ify)/i),
  a('mojeek', 'MojeekBot', 'Mojeek', 'search_crawler', /MojeekBot/i),
  a('ecosia', 'EcosiaBot', 'Ecosia', 'search_crawler', /EcosiaBot/i),

  // --- SEO / marketing ---
  a('ahrefs', 'AhrefsBot', 'Ahrefs', 'seo_crawler', /AhrefsBot|AhrefsSiteAudit/i),
  a('semrush', 'SemrushBot', 'Semrush', 'seo_crawler', /SemrushBot|SiteAuditBot/i),
  a('majestic', 'MJ12bot', 'Majestic', 'seo_crawler', /MJ12bot/i),
  a('moz', 'Moz (rogerbot/DotBot)', 'Moz', 'seo_crawler', /rogerbot|DotBot/i),
  a('screamingfrog', 'Screaming Frog', 'Screaming Frog', 'seo_crawler', /Screaming Frog/i),
  a('blexbot', 'BLEXBot', 'WebMeUp', 'seo_crawler', /BLEXBot/i),
  a('dataforseo', 'DataForSeoBot', 'DataForSEO', 'seo_crawler', /DataForSeoBot/i),
  a('serpstat', 'SerpstatBot', 'Serpstat', 'seo_crawler', /serpstatbot/i),

  // --- Link previews ---
  a('facebook', 'facebookexternalhit', 'Meta', 'preview_bot', /facebookexternalhit|facebookcatalog/i),
  a('twitter', 'Twitterbot', 'X', 'preview_bot', /Twitterbot/i),
  a('slack', 'Slackbot', 'Slack', 'preview_bot', /Slackbot|Slack-ImgProxy/i),
  a('linkedin', 'LinkedInBot', 'LinkedIn', 'preview_bot', /LinkedInBot/i),
  a('discord', 'Discordbot', 'Discord', 'preview_bot', /Discordbot/i),
  a('telegram', 'TelegramBot', 'Telegram', 'preview_bot', /TelegramBot/i),
  a('whatsapp', 'WhatsApp', 'Meta', 'preview_bot', /WhatsApp\//i),
  a('signal', 'Signal link preview', 'Signal', 'preview_bot', /Signal-Android|Signal-Desktop/i),
  a('pinterest', 'Pinterestbot', 'Pinterest', 'preview_bot', /Pinterest(?:bot)?/i),
  a('reddit', 'redditbot', 'Reddit', 'preview_bot', /redditbot/i),
  a('mastodon', 'Mastodon', 'Fediverse', 'preview_bot', /Mastodon\/|Pleroma|Misskey/i),
  a('skype', 'Teams/Skype preview', 'Microsoft', 'preview_bot', /SkypeUriPreview|MicrosoftPreview/i),
  a('iframely', 'Iframely/Embedly', 'various', 'preview_bot', /Iframely|Embedly/i),

  // --- Monitoring / performance ---
  a('uptimerobot', 'UptimeRobot', 'UptimeRobot', 'monitor', /UptimeRobot/i),
  a('pingdom', 'Pingdom', 'SolarWinds', 'monitor', /Pingdom/i),
  a('statuscake', 'StatusCake', 'StatusCake', 'monitor', /StatusCake/i),
  a('betteruptime', 'Better Stack', 'Better Stack', 'monitor', /Better ?Uptime|BetterStack/i),
  a('site24x7', 'Site24x7', 'Zoho', 'monitor', /Site24x7/i),
  a('datadog', 'Datadog Synthetics', 'Datadog', 'monitor', /Datadog/i),
  a('lighthouse', 'Lighthouse / PageSpeed', 'Google', 'monitor', /Chrome-Lighthouse|PageSpeed/i),
  a('gtmetrix', 'GTmetrix', 'GTmetrix', 'monitor', /GTmetrix/i),
  a('uptime-kuma', 'Uptime Kuma', 'open source', 'monitor', /Uptime-Kuma/i),

  // --- Security scanners ---
  a('censys', 'Censys', 'Censys', 'scanner', /CensysInspect|censys/i),
  a('expanse', 'Palo Alto Expanse', 'Palo Alto Networks', 'scanner', /Expanse/i),
  a('nuclei', 'Nuclei', 'ProjectDiscovery', 'scanner', /Nuclei/i),
  a('zgrab', 'zgrab', 'open source', 'scanner', /zgrab/i),
  a('masscan', 'masscan', 'open source', 'scanner', /masscan/i),
  a('nmap', 'Nmap', 'open source', 'scanner', /Nmap Scripting Engine/i),
  a('sqlmap', 'sqlmap', 'open source', 'scanner', /sqlmap/i),
  a('nikto', 'Nikto', 'open source', 'scanner', /Nikto/i),
  a('wpscan', 'WPScan', 'WPScan', 'scanner', /WPScan/i),
  a('leakix', 'LeakIX', 'LeakIX', 'scanner', /l9explore|l9tcpid|LeakIX/i),
  a('internetmeasurement', 'InternetMeasurement', 'Driftnet', 'scanner', /InternetMeasurement/i),
  a('shodan', 'Shodan', 'Shodan', 'scanner', /Shodan/i),

  // --- Browser automation that announces itself ---
  a('headless-chrome', 'Headless Chrome', 'Google', 'automation', /HeadlessChrome/i),
  a('phantomjs', 'PhantomJS', 'open source', 'automation', /PhantomJS/i),
  a('electron', 'Electron', 'open source', 'automation', /Electron\//i),
  a('cypress', 'Cypress', 'Cypress', 'automation', /Cypress/i),

  // --- HTTP clients and scraping libraries ---
  a('curl', 'curl', 'open source', 'script', /^curl\//i),
  a('wget', 'Wget', 'open source', 'script', /^Wget\//i),
  a('httpie', 'HTTPie', 'open source', 'script', /HTTPie/i),
  a('python', 'Python HTTP client', 'open source', 'script', /python-requests|python-urllib|python-httpx|aiohttp|Python\//i),
  a('scrapy', 'Scrapy', 'open source', 'script', /Scrapy/i),
  a('go', 'Go HTTP client', 'open source', 'script', /Go-http-client/i),
  a('node', 'Node.js HTTP client', 'open source', 'script', /node-fetch|undici|axios|got \(|^node$/i),
  a('java', 'Java HTTP client', 'open source', 'script', /^Java\/|Apache-HttpClient|okhttp/i),
  a('ruby', 'Ruby HTTP client', 'open source', 'script', /^Ruby|Faraday/i),
  a('php', 'PHP HTTP client', 'open source', 'script', /GuzzleHttp|^PHP/i),
  a('perl', 'Perl LWP', 'open source', 'script', /libwww-perl/i),
  a('postman', 'Postman', 'Postman', 'script', /PostmanRuntime/i),
  a('powershell', 'PowerShell', 'Microsoft', 'script', /WindowsPowerShell/i),
  a('rust', 'Rust HTTP client', 'open source', 'script', /^reqwest|^hyper/i),
  a('dotnet', '.NET HttpClient', 'Microsoft', 'script', /^\.NET|System\.Net\.Http/i),
]);

/** Signature-Agent hosts we can map to a known product (Web Bot Auth). */
export const SIGNATURE_AGENTS = Object.freeze([
  { host: 'chatgpt.com', name: 'ChatGPT agent', operator: 'OpenAI', category: 'ai_browser_agent' },
]);

/** Generic catch-all: "bot", "crawler", "spider" in the UA without a more specific match. */
export const GENERIC_BOT_UA = /\b(?:bot|crawler|spider|scraper|fetcher|crawl)\b/i;

export function matchAgent(ua) {
  if (!ua) return null;
  return AGENTS.find((agent) => agent.ua.test(ua)) || null;
}

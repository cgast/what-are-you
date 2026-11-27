// The verdicts the classifier can reach. Single source of truth for labels and intent descriptions.

export const CATEGORIES = Object.freeze({
  human: {
    label: 'a human',
    icon: '🧑',
    intent: 'Browsing with your own eyes and hands. Welcome!',
  },
  ai_browser_agent: {
    label: 'an AI agent driving a browser',
    icon: '🤖',
    intent: 'An AI model operating a real browser, usually on behalf of a person (think ChatGPT agent, Claude in Chrome, browser-use).',
  },
  ai_user_fetcher: {
    label: 'an AI assistant fetching for a person',
    icon: '💬',
    intent: 'Someone asked an AI a question and it is reading this page right now to answer them.',
  },
  ai_retrieval: {
    label: 'an AI retrieval service',
    icon: '🧲',
    intent: 'A scraping/search API that turns web pages into input for someone else\'s AI application.',
  },
  ai_search: {
    label: 'an AI search indexer',
    icon: '🔎',
    intent: 'Indexing pages so an AI answer engine can find and cite them later.',
  },
  ai_training: {
    label: 'an AI training crawler',
    icon: '📚',
    intent: 'Collecting text to train or improve AI models.',
  },
  search_crawler: {
    label: 'a search engine crawler',
    icon: '🕷️',
    intent: 'Indexing pages for a classic search engine.',
  },
  crawler: {
    label: 'an unidentified crawler',
    icon: '🐛',
    intent: 'Calls itself a bot or crawler but isn\'t one we recognise. Purpose unknown.',
  },
  seo_crawler: {
    label: 'an SEO / marketing crawler',
    icon: '📈',
    intent: 'Mapping links and keywords for SEO or marketing analytics.',
  },
  preview_bot: {
    label: 'a link preview bot',
    icon: '🔗',
    intent: 'Someone shared this link in a chat or social app; this bot fetches the title and image for the preview.',
  },
  monitor: {
    label: 'an uptime / performance monitor',
    icon: '⏱️',
    intent: 'Checking that this site is up and fast.',
  },
  scanner: {
    label: 'a security scanner',
    icon: '🛡️',
    intent: 'Probing the internet for exposed services or vulnerabilities (research or otherwise).',
  },
  signed_bot: {
    label: 'a cryptographically signed bot',
    icon: '🔏',
    intent: 'An automated client that proved its identity with a Web Bot Auth signature.',
  },
  automation: {
    label: 'an automated browser',
    icon: '🦾',
    intent: 'A scripted browser (Playwright, Puppeteer, Selenium …). Could be a test, a scraper, or an AI agent without obvious AI tells.',
  },
  script: {
    label: 'a script / HTTP client',
    icon: '⌨️',
    intent: 'A program fetching raw HTML (curl, Python, Go …). Could be a developer, a scraper, or an AI tool\'s fetch function.',
  },
  impersonator: {
    label: 'an impersonator',
    icon: '🎭',
    intent: 'Something that claims to be a well-known client but failed the checks that client would pass.',
  },
  unknown: {
    label: 'unknown',
    icon: '❓',
    intent: 'Not enough evidence yet.',
  },
});

export const categoryIds = Object.keys(CATEGORIES);

import { html, raw } from '../lib/html.js';

export function layout({ title, body, head = '', bodyAttrs = '' }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="A welcome screen that tells you what you are (human, crawler, AI agent, script) and shows its evidence.">
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="data:,">
<link rel="alternate" type="text/markdown" href="/?format=md" title="Markdown version for agents">
${head}
</head>
<body ${raw(bodyAttrs)}>
<header class="site-header">
  <a class="brand" href="/">what are you<span aria-hidden="true">?</span></a>
  <nav><a href="/about">How it works</a><a href="/stats">Stats</a><a href="/llms.txt">llms.txt</a></nav>
</header>
<main>${body}</main>
<footer class="site-footer">
  <p>We store no raw IP addresses, only a keyed hash, and delete visits after 30 days. <a href="/about#privacy">Privacy</a></p>
</footer>
</body>
</html>`;
}

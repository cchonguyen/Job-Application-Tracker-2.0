/**
 * Gmail Bridge for the Job Application Tracker.
 *
 * Deploy as a Google Apps Script web app. The tracker's server calls it on demand,
 * only when the Gmail suggestions panel is opened. There are no time triggers.
 *
 * What it does: searches your Gmail for likely job-related emails and returns a
 * short summary of each message as JSON. It only reads. It never sends, labels,
 * moves, or deletes mail.
 *
 * Deploy settings:
 *   Execute as: Me
 *   Who has access: Anyone (the key protects it)
 *
 * One-time setup: run setup() once and copy the key from the Execution log.
 * Step-by-step guide: docs/GMAIL_BRIDGE.md
 */

// Edit these to change which emails are included. The days window is added in front.
const QUERY_FILTERS =
  '-in:chats -category:promotions ' +
  '(from:(greenhouse-mail.io OR greenhouse.io OR lever.co OR hire.lever.co OR myworkday.com OR ' +
  'ashbyhq.com OR smartrecruiters.com OR icims.com OR jobvite.com OR workablemail.com OR ' +
  'bamboohr.com OR rippling.com) OR subject:(application OR applying OR interview OR candidacy OR offer OR "next steps"))';

const MAX_THREADS = 100;
const MAX_MESSAGES = 200;
const MAX_SNIPPET = 1500;
const MAX_LINKS = 20;

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (!isAuthorized(params.key)) return json({ ok: false, error: 'unauthorized' });
    const days = parseDays(params.days);
    return json({ ok: true, items: collectItems(days) });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Compares every character so the time taken does not reveal where a wrong key differs.
function isAuthorized(given) {
  const expected = PropertiesService.getScriptProperties().getProperty('BRIDGE_KEY');
  if (!expected || typeof given !== 'string') return false;
  const len = Math.max(expected.length, given.length);
  let diff = expected.length ^ given.length;
  for (let i = 0; i < len; i++) {
    diff |= (expected.charCodeAt(i) || 0) ^ (given.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function parseDays(raw) {
  const n = parseInt(raw, 10);
  if (isNaN(n)) return 14;
  return Math.min(60, Math.max(1, n));
}

function collectItems(days) {
  const me = (Session.getActiveUser().getEmail() || '').toLowerCase();
  const query = 'newer_than:' + days + 'd ' + QUERY_FILTERS;
  const threads = GmailApp.search(query, 0, MAX_THREADS);
  const items = [];
  for (let t = 0; t < threads.length && items.length < MAX_MESSAGES; t++) {
    const messages = threads[t].getMessages();
    // Threads list oldest first, so walk backwards to take the newest messages first.
    for (let m = messages.length - 1; m >= 0 && items.length < MAX_MESSAGES; m--) {
      const msg = messages[m];
      const from = msg.getFrom().toLowerCase();
      if (me && (from === me || from.indexOf('<' + me + '>') !== -1)) continue;
      items.push(toItem(msg, threads[t].getId()));
    }
  }
  return items;
}

function toItem(msg, threadId) {
  return {
    id: msg.getId(),
    threadId: threadId,
    date: msg.getDate().toISOString(),
    from: msg.getFrom(),
    subject: msg.getSubject(),
    snippet: (msg.getPlainBody() || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SNIPPET),
    links: extractLinks(msg.getBody() || '')
  };
}

function extractLinks(html) {
  const seen = {};
  const out = [];
  const re = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < MAX_LINKS) {
    const url = m[1].replace(/&amp;/g, '&');
    if (!seen[url]) {
      seen[url] = true;
      out.push(url);
    }
  }
  return out;
}

// Run once from the Apps Script editor. Creates the key if none exists and logs it.
function setup() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('BRIDGE_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('BRIDGE_KEY', key);
  }
  Logger.log('BRIDGE_KEY: ' + key);
}

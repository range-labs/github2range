#!/usr/bin/env node

const crypto = require('crypto');
const https = require('https');

const colors = require('colors');
const { Octokit } = require('@octokit/rest');
const rc = require('rc');

const pkg = require('../package.json');

const cfg = rc('github2range', {
  // The GitHub host, set this to your GitHub Enterprise instance.
  githubHost: 'api.github.com',

  // A personal access token for authenticating GitHub API requests.
  githubAccessToken: '',

  // URL to post suggestions to, generate a URL on the Range integration settings screeen.
  rangeWebhook: '',

  // Map of GitHub username to email.
  users: {},

  // Max age in hours to
  maxAge: 24,

  // Color coonfiguration for logging.
  colors: {
    debug: 'gray',
    info: 'yellow',
    warn: 'cyan',
    error: ['bgRed', 'white'],
  },
});

colors.setTheme(cfg.colors);

validateConfig();

// We use Octokit to access GitHub REST APIS. See https://octokit.github.io/rest.js/ for docs.
const client = new Octokit({
  userAgent: `github2range/${pkg.version}`,
  baseUrl: `https://${cfg.githubHost}`,
  auth: cfg.githubAccessToken,
});

// Event mappers take a GitHub event object and return a Range suggestion payload.
// See https://developer.github.com/v3/activity/events/types/ for details of the GitHub events and
// https://help.range.co/en/articles/2383870-custom-range-integrations to find out about the Range
// suggestioon payload.
// TODO: Support other events that indicate work.
const eventMappers = {
  PullRequestEvent: (evt, email) => {
    const reason = pullRequestReason(evt);
    if (!reason) return null;
    return {
      email_hash: emailHash(email),
      dedupe_strategy: 'UPSERT_PENDING',
      reason: reason,
      is_future: false,
      attachment: pullRequestAttachment(evt.payload.pull_request, evt.repo),
    };
  },
  PullRequestReviewCommentEvent: (evt, email) => {
    // Ignore comments on your own pull requests.
    if (evt.payload.pull_request.user.login === evt.actor.login) return null;
    return {
      email_hash: emailHash(email),
      dedupe_strategy: 'UPSERT_PENDING',
      reason: 'REVIEWED',
      is_future: false,
      attachment: pullRequestAttachment(evt.payload.pull_request, evt.repo),
    };
  },
};

(async () => {
  try {
    const {
      data: { login: username },
    } = await client.users.getAuthenticated();

    const after = Date.now() - cfg.maxAge * 60 * 60 * 1000;
    const afterStr = new Date(after).toLocaleString();
    console.log(`▸ Collecting events for ${username} after ${afterStr}`.info);

    let events = await listEvents(username, after);
    let suggestions = {};
    let unmappedUsers = {};
    events.forEach((evt) => {
      const username = evt.actor.login;
      const email = cfg.users[username];
      if (!email) {
        unmappedUsers[username] = (unmappedUsers[username] || 0) + 1;
        return;
      }
      if (eventMappers[evt.type]) {
        const s = eventMappers[evt.type](evt, email);
        if (s && !suggestions[s.attachment.source_id]) {
          suggestions[s.attachment.source_id] = s;
          const a = s.attachment;
          console.log(`• Suggestion for ${username} ${a.type} ${s.reason} : ${a.name}`.debug);
        }
      }
    });

    const names = Object.keys(unmappedUsers);
    if (names.length !== 0) {
      console.log(`▸ Saw ${names.length} events from unmapped users: ${names.join(', ')}`.debug);
    }

    console.log(`▸ ${Object.values(suggestions).length} suggestions found, sending to Range`.info);
    for (let i in suggestions) {
      await makeSuggestion(suggestions[i]);
    }
    console.log(`▸ All done!`.warn);
  } catch (e) {
    console.log(e.message.error);
    console.log(e);
  }
})();

// Fetches events for each org the authenticated user is a member of.
async function listEvents(username, after) {
  let orgs = await listOrgs();
  let events = [];
  for (let i = 0; i < orgs.length; i++) {
    let org = orgs[i];
    let page = 1;
    let done = false;
    try {
      while (!done) {
        const { data } = await client.activity.listOrgEventsForAuthenticatedUser({
          username,
          org,
          page,
          per_page: 20,
        });
        data.forEach((evt) => {
          if (new Date(evt.created_at) > after) events.push(evt);
          else done = true;
        });
        if (data.length === 0) done = true;
        page++;
      }
      console.log(`• ${org} : ${events.length} events in period`.info);
    } catch (e) {
      console.log(`! Error while fetching events for ${org}. You may need to lower maxAge.`.error);
      console.log(e.message.debug);
      console.log(`Continuing using the events collected...`);
    }
  }
  return events;
}

// Fetches the 'login' name for each org the user is a member of.
async function listOrgs() {
  let resp = await client.orgs.listForAuthenticatedUser({ per_page: 100 });
  return resp.data.map((org) => org.login);
}

// Sends a suggestion to the Range webhook specified in the config.
async function makeSuggestion(suggestion) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(suggestion);

    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    let req = https.request(cfg.rangeWebhook, opts, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        console.log(chunk);
      });
      res.on('end', () => {
        resolve();
      });
    });
    req.write(payload);
    req.end();
  });
}

// Determine the suggestion reason for a Pull Request. Null means no suggestion will be made.
function pullRequestReason(evt) {
  if (evt.payload.action === 'opened') return 'OPENED';
  if (evt.payload.action === 'closed' && evt.payload.pull_request.merged) return 'MERGED';

  // TODO: Handle review_requested events.
  return null;
}

// Create a Range attachment object for a pull request.
function pullRequestAttachment(pr, repo) {
  return {
    source_id: String(pr.id),
    provider: 'github2range',
    provider_name: 'GitHub',
    type: 'CODE_CHANGE',
    name: pr.title,
    description: pr.body,
    html_url: pr.html_url,
    parent_name: repo.name,
    parent_html_url: pr.html_url.replace(/\/pull\/[0-9]+$/, ''), // TODO: repo.url is api url not html url
    date_created: pr.created_at,
    date_modified: pr.updated_at,
    date_closed: pr.closed_at,
    change_id: String(pr.number),
    change_label: 'PR #',
    change_state: pr.state,
  };
}

// The Range suggestions API allows account matching based on a plain text email or a hash of the
// email. This is an extra precaution to avoid sending email addresses that aren't already in the
// system.
function emailHash(email) {
  let shasum = crypto.createHash('sha1');
  shasum.update(email);
  return shasum.digest('hex');
}

function validateConfig() {
  if (!cfg.githubAccessToken) exit('githubAccessToken not specified');
  if (!cfg.rangeWebhook) exit('rangeWebhook not specified');
  if (Object.values(cfg.users).length === 0) exit('no users configured');
}

function exit(msg) {
  console.error(`ERROR: ${msg}\n`.error);
  process.exit(1);
}

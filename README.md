![Range Logo](./img/range-arch.png)

# GitHub 2 Range &middot; [![License](https://img.shields.io/github/license/range-labs/github2range.svg)](https://github.com/range-labs/github2range/blob/master/LICENSE) [![Twitter](https://img.shields.io/twitter/follow/rangelabs.svg?style=social)](https://twitter.com/rangelabs)

_Range helps teams know what’s happening, stay in sync, and actually feel like a team. It’s
thoughtfully designed software that helps teams share daily check-ins, track goals, and run better
meetings. So you can do your best work together._

_Everything is easier in Range because it works with the tools you already use. Your tasks,
documents, and code changes are already in Range, so you don’t have to enter data twice._

_Find out more at [www.range.co](https://www.range.co)._

## About

Range supports native integrations for both [GitHub](https://help.range.co/en/articles/2684211-github)
and [GitHub Enterprise](https://help.range.co/en/articles/2832432-github-enterprise) via GitHub's
OAuth APIs. However in some situations it is not possible to use these APIs, either due to
administrative controls or firewalls that prevent API access.

This package provides a self-hosted script that allows you to generate GitHub suggestions without
giving Range direct access to GitHub APIs or tokens.

## Installation

```bash
npm install -g github2range
```

## Usage

Example:

```
$ github2range --config our-team.json

▸ Collecting events for dpup after 7/16/2019, 6:51:51 PM
• range-labs : 45 events in period
• Suggestion for dpup CODE_CHANGE MERGED : admin: fixes updating of name
• Suggestion for seanami CODE_CHANGE MERGED : Fix issues with getUserListForOrg
• Suggestion for dpup CODE_CHANGE MERGED : materializer: create views for org stats
▸ Saw 2 events from unmapped users: kowitz, stephyeung
▸ 3 suggestions found, sending to Range
▸ All done!
```

## Configuration Options

**githubAccessToken** - A personal API key for GitHub with repo and user scopes.

**githubHost** - The API hostname for your GitHub Enterprise instance. Default: api.github.com

**rangeWebhook** - The URL for the Range webhook where suggestions will be posted.

**users** - A map of GitHub usernames to the email address of a Range user.

**maxAge** - The maximum age of events that should be processed. Default: 24.

See `sample-config.json` for a template of a minimal configuration file. See below for additional
options.

This config can be passed as a flag, `--config config.json`, or saved in one of the following
locations:

- `~/.github2rangerc`
- `~/.github2range/config`
- `~/.config/github2range`
- `~/.config/github2range/config`
- `/etc/github2rangerc`
- `/etc/github2range/config`

## Docker

This repository provides a `Dockerfile` which can be used to execute `github2range`. You can
customize the Dockerfile and copy over a config file to one of the above locations, or you can pass
configuration options to docker via environment variables. For example:

```bash
docker build -t github2range .
docker run \
  --env github2range_githubAccessToken=XXXXXXXX \
  --env github2range_rangeWebhook=https://in.range.co/services/incoming/XXXXXXXX \
  --env github2range_users__catboy=conner@pjmasks.com \
  --env github2range_users__owlette=amaya@pjmasks.com \
  --env github2range_users__ghlogin=email@company.com \
  github2range
```

A prebuilt is available on Docker hub at [pupius/github2range](https://hub.docker.com/r/pupius/github2range).

## FAQ

### How do I get a GitHub access token?

To get a GitHub access token, visit https://github.com/settings/tokens (or the equivalent page on
your GitHub Enterprise instance.) and follow the steps to create a new token. Specify the `repo` and
`user` scopes.

### How do I create an incoming webhook for Range?

Find the "Custom Integrations" section at the bottom of https://range.co/_/settings/integrations.
Note that some workspaces require that you be an admin to create webhools. This webhook can be used
to create suggestions for anyone in your org. See [this help center article](https://help.range.co/en/articles/2383870-custom-range-integrations)
for more information about the incoming webhooks.

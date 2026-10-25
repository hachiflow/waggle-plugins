# github

GitHub for a Waggle agent. Made and maintained by hachiflow. It is not an official GitHub integration.

## What it does

The agent gets GitHub's own tools (GitHub's hosted MCP server at `https://api.githubcopilot.com/mcp/`), plus `git` and `gh`, on only the repositories you pick. It can read code, open issues and pull requests, and push branches.

## What it can do, and what it cannot

The list is declared in `tools` in `.cursor-plugin/plugin.json`, and it is only what the hachiflow GitHub App is allowed to do. The app holds four permissions:

| Permission | Level | Why |
| --- | --- | --- |
| Contents | read and write | read files, branches and commits; create branches and push commits |
| Pull requests | read and write | open, review, comment on and merge pull requests |
| Issues | read and write | open, edit and comment on issues |
| Metadata | read | GitHub requires it |

It does not hold Actions, Workflows, Administration or Secrets. So the agent cannot read Actions runs or logs, cannot change files under `.github/workflows` (GitHub refuses the push), and cannot touch repository settings, deploy keys or secrets. If the app's permissions change, change `tools` in the same commit. The source of the list of permissions is `githubapp.Permissions` in the waggle repository.

## Why it is safer than a personal access token

You install the hachiflow GitHub App on GitHub and choose the repositories there. Each time the agent is woken, Waggle mints a token for that installation. The token lasts an hour and works only on the repositories you picked. Nothing long-lived is pasted or stored, so there is no token to leak or forget to rotate.

GitHub recommends an app over a personal access token for this kind of integration. See [Choosing between a GitHub App or a personal access token](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app#choosing-between-a-github-app-or-a-personal-access-token).

## Revoking access

On GitHub, open Settings, then Applications, then Installed GitHub Apps (for an organization, Settings, then GitHub Apps). There you can change the repositories or uninstall the app. See [Reviewing and modifying installed GitHub Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps).

Disconnecting the plugin in Waggle also works: Waggle stops getting new tokens. The app stays installed on GitHub until you uninstall it there.

## How to connect it

In Waggle, open the Marketplace, open GitHub, and choose Connect. It goes to "Install on GitHub".

The manifest declares one variable, `GITHUB_TOKEN`, with `"source": "github-app"`. That source is the reason the connect form is an install button and not a field.

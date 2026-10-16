# waggle-plugins

Plugins hachiflow maintains for Waggle agents, for services whose own plugin is in neither of Cursor's listings. The format is the one `cursor/plugins` uses.

| Plugin | What it gives an agent | Sign in |
| --- | --- | --- |
| `github` | `git` and `gh` in the agent's sandbox, and GitHub's hosted MCP server at `https://api.githubcopilot.com/mcp/`: files, issues, pull requests, branches and code search on the repositories you pick | an "Install on GitHub" button: you install hachiflow's GitHub App and choose the repositories on GitHub's own screen |
| `blotato` | Blotato's hosted MCP server at `https://mcp.blotato.com/mcp`: publish and schedule posts to X, LinkedIn, Facebook, Instagram, TikTok, YouTube, Threads, Bluesky and Pinterest | a Blotato API key |

`github` takes the name of Cursor's plugin on purpose. Cursor's asks for a pasted personal access token; this one connects through hachiflow's GitHub App, which gives the agent a token that lasts an hour and reaches only the repositories you picked.

These are not official plugins of the services they connect to. Each one only points an agent at the service's own MCP server; the names and marks belong to their owners.

## They are already in every workspace

This repository is a built-in source of the Waggle catalog, named `hachiflow-plugins`. Every workspace reads it, beside `cursor/plugins` and Cursor's marketplace. There is nothing to add and nothing to set up: do not run `hachi catalog sources --add` for this repository.

An instance on a waggle build from before 2026-10-12 does not read this repository yet. Until it is upgraded, and only there, an admin adds it by hand with `hachi catalog sources --add hachiflow/waggle-plugins --tenant <workspace>` and then `hachi catalog refresh --tenant <workspace>`.

- **A person** opens the Marketplace in the builder, finds the plugin by name or under its category, adds it for an agent, and pastes the key in the connect form that follows. The key is stored in the workspace's vault and is sent only to the plugin's own host; the agent never sees it.
- **An agent** that needs the tool searches the catalog, finds the plugin, and shows the person it belongs to a connector card. Approving the card installs it, and the same connect form asks for the key. So "ask Gary to request Blotato" is enough.
- **From a terminal**, the same catalog:

```sh
hachi catalog ls --q blotato --tenant <workspace>
hachi connector add blotato --agent <agent> --tenant <workspace>
```

A name that is in this repository and in one of Cursor's listings resolves to this repository's plugin, because it is the source hachiflow writes and vouches for. So a name here is chosen with care: reuse a Cursor name only to replace that plugin on purpose.

## Adding a plugin

When a customer asks for a tool the catalog does not carry, the whole change is one commit here. Nothing changes in waggle.

1. Make a directory named for the plugin, with two files:
   - `<name>/.cursor-plugin/plugin.json`: `name` (the directory's name, a slug), `displayName`, `description`, `category`, `homepage`, and `mcpServers` pointing at `./mcp.json`.
   - `<name>/mcp.json`: the service's hosted MCP server. Only an `http` server with an `https` url runs in a workspace; a `stdio` or `sse` server is listed and refused.
2. Say how it signs in:
   - **A key**: put it in a header as a placeholder, `"x-api-key": "${SERVICE_API_KEY}"`, and declare `SERVICE_API_KEY` under `variables` in the manifest with a `title` (the label on the connect form) and a `description` (where a person finds the key). Never commit a real value.
   - **An app install**: when the service has an app waggle installs for a person (today only GitHub's, `"source": "github-app"`), declare the variable with that `source` and no other key. The connect form is then the service's own install button, nothing is pasted, and the value is made by waggle each time the agent is woken. Use it as `"Authorization": "Bearer ${GITHUB_TOKEN}"`; see `github/`. A new source is a change in waggle, not here, and one plugin does not mix a source with pasted keys.
   - **OAuth**: declare nothing. An http server with no placeholder is signed in to through the service's own OAuth, discovered at its url.
3. Set `category` to the chip the plugin belongs under in the Marketplace: `marketing`, `productivity`, `inbox-and-collaboration`, `customer-support`, `sales`, `payments`, `data-analytics`, `infrastructure`, `design`, `research`, `documents-and-files`, `scheduling`, `finance-and-legal`, `developer-tools`, `agent-orchestration` or `integrations`. A new chip is the one thing that needs a change in waggle (`internal/catalog/curation.toml`).
4. Add a row for it to `.cursor-plugin/marketplace.json` (`name`, `source`, `description`) and to the table above.
5. Check it on your machine, then open a pull request:

```sh
node scripts/validate.mjs
```

A maintainer runs the full check on your pull request's head commit before merging it (see "The check"). Do not push to `main` without that.

Every Waggle instance re-reads this repository at boot and once an hour, pinned to the commit it read, so the plugin is in every workspace's catalog within the hour. An admin who will not wait runs:

```sh
hachi catalog refresh --tenant <workspace>
```

## The check

Three layers, none of which runs anything from this repository.

- **`scripts/validate.mjs`** is the check you run before opening a pull request. It needs Node 18 or later and nothing else, and reads files only. It is a copy: the one that counts lives in hachiflow's private repository and the full check fails if this file differs from it, so a pull request cannot change it. If it needs to change, ask a maintainer.
- **The full check** runs on hachiflow's side, on every commit to `main` (within ten minutes, and on a schedule) and on demand for a pull request. It parses the repository with the same indexer the servers use, so what passes is what is served, and adds the file and content rules: only `https` servers on public hosts, only `${NAME}` placeholders in headers and none undeclared, no literal secret or key shaped string, a known category, the MIT license, a description that says "Maintained by hachiflow, not by <vendor>", a unique name that is not already a plugin of Cursor's listings, every directory listed and every listing present, no workflows, symlinks, executables, binaries or images, and size limits. Nothing in the repository is executed, and no pull request runs code on hachiflow's machines.
- **The servers hold a bad plugin back.** If a plugin on `main` fails these rules anyway, every Waggle instance skips it and keeps serving the last good version of it; a marketplace file that does not parse leaves the previous catalog serving. Customers keep what they had; the new or changed plugin is simply not offered until it is fixed.

When the check fails on `main`, an issue opens in hachiflow's private repository naming each finding, and closes itself when `main` is green again. When it fails on your pull request, a maintainer pastes the findings into the pull request; each one names the plugin or file and what to change. Fix it in the same branch and ask for another run.

There is deliberately no workflow in this repository: it has to be public, because every instance reads it anonymously, and hachiflow's self hosted runners are closed to public repositories so that a fork's pull request can never run on them.

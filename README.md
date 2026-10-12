# waggle-plugins

Plugins hachiflow maintains for Waggle agents, for services whose own plugin is in neither of Cursor's listings. The format is the one `cursor/plugins` uses.

| Plugin | What it gives an agent | Sign in |
| --- | --- | --- |
| `blotato` | Blotato's hosted MCP server at `https://mcp.blotato.com/mcp`: publish and schedule posts to X, LinkedIn, Facebook, Instagram, TikTok, YouTube, Threads, Bluesky and Pinterest | a Blotato API key |

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
   - **OAuth**: declare nothing. An http server with no placeholder is signed in to through the service's own OAuth, discovered at its url.
3. Set `category` to the chip the plugin belongs under in the Marketplace: `marketing`, `productivity`, `inbox-and-collaboration`, `customer-support`, `sales`, `payments`, `data-analytics`, `infrastructure`, `design`, `research`, `documents-and-files`, `scheduling`, `finance-and-legal`, `developer-tools`, `agent-orchestration` or `integrations`. A new chip is the one thing that needs a change in waggle (`internal/catalog/curation.toml`).
4. Add a row for it to `.cursor-plugin/marketplace.json` (`name`, `source`, `description`) and to the table above.
5. Check it, then push to `main`:

```sh
node scripts/validate.mjs
```

Every Waggle instance re-reads this repository at boot and once an hour, pinned to the commit it read, so the plugin is in every workspace's catalog within the hour. An admin who will not wait runs:

```sh
hachi catalog refresh --tenant <workspace>
```

## The check

`scripts/validate.mjs` reads every plugin the way waggle's indexer does and fails on anything that would be skipped, or listed and refused: a manifest that does not parse or has no name, a name that differs from its row, an MCP file that is missing, a server that is not `https`, a credential written as a literal, a `${NAME}` no variable declares, a category that is no chip. It needs Node 18 or later and nothing else.

It runs by hand today. hachiflow's CI runs on self hosted runners only, and those are closed to public repositories, as they should be: a pull request from a fork must not run on them. This repository has to be public, because every instance reads it anonymously, so there is no workflow here yet.

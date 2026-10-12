# waggle-plugins

Plugins hachiflow maintains for Waggle agents, for services whose own plugin is not in the catalog yet. The format is the one `cursor/plugins` uses.

| Plugin | What it gives an agent | Sign in |
| --- | --- | --- |
| `blotato` | Blotato's hosted MCP server at `https://mcp.blotato.com/mcp`: publish and schedule posts to X, LinkedIn, Facebook, Instagram, TikTok, YouTube, Threads, Bluesky and Pinterest | a Blotato API key |

These are not official plugins of the services they connect to. Each one only points an agent at the service's own MCP server; the names and marks belong to their owners.

## Use it in a workspace

Add this repository as a source, index it, and install the plugin for one agent:

```sh
hachi catalog sources --add hachiflow/waggle-plugins --tenant <workspace>
hachi catalog refresh --tenant <workspace>
hachi connector add blotato --agent <agent> --tenant <workspace>
```

Then give the connector its key in the builder, under the agent's connectors. The key is stored in the workspace's vault and is sent only to the plugin's own host; the agent never sees it.

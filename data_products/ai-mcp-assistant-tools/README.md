# ai-mcp-assistant-tools-demo

Nextdata OS data product from **Build series 07 — MCP tools**.

Exposes a calculator function (`add_numbers` / MCP tool `calculator`) over an MCP server port so AI assistants can call it.

## Source tutorial

- [07 MCP](https://nxd.partner.nextopia.dev/docs/#/tutorials/guides/07-mcp)
- [Using MCP](https://nxd.partner.nextopia.dev/docs/#/basics/using_mcp)

## Files

| File | Role |
|---|---|
| `models.py` | `add_request` / `add_response` semantic models |
| `mcp_tools.py` | `@mcp.tool` calculator implementation |
| `spec_imports.py` | Spec DSL + model/tool re-exports |
| `spec.py` | S3 output + MCP RPC port + access control |
| `requirements.txt` | `nxd_data_product[spec]`, `nxd-drivers[rpc]` |

## Launch

```bash
nxd validate
nxd launch
nxd logs ai-mcp-assistant-tools-demo
```

Replace `hello@nextdata.com` in `spec.py` with your account (`nxd whoami`) before launch if needed.

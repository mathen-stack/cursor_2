# Multi-channel sales (Nextdata / Nextopia)

Autonomous data products built from the official Nextopia NXD OS build series:

- [Requirements](https://nxd.partner.nextopia.dev/docs/#/tutorials/cli/requirements)
- [CLI setup](https://nxd.partner.nextopia.dev/docs/#/tutorials/cli/setup)
- [Build series](https://nxd.partner.nextopia.dev/docs/#/tutorials/guides/getting-started)

## Data products

| Product | Path | What it does |
|---|---|---|
| **multi-channel-sales-demo** | [`data_products/multi-channel-sales/`](data_products/multi-channel-sales/) | Tracks sales velocity across channels/regions; writes to Snowflake, S3, and ADLS; scheduled + event-triggered (build series 01–06) |
| **ai-mcp-assistant-tools-demo** | [`data_products/ai-mcp-assistant-tools/`](data_products/ai-mcp-assistant-tools/) | MCP calculator tools for AI assistants (build series 07) |
| **revenue-intelligence-demo** | [`data_products/revenue-intelligence/`](data_products/revenue-intelligence/) | Quick-start revenue analytics product writing to Snowflake |

## Docs mirror

Local copies of the source tutorials live under [`docs/`](docs/):

- [`docs/requirements/`](docs/requirements/) — CLI environment checklist + setup
- [`docs/build-series/`](docs/build-series/) — stages 01–07 + quick start

## Prerequisites

See [`docs/requirements/cli-requirements.md`](docs/requirements/cli-requirements.md):

- macOS 12+ / Linux (Ubuntu 20.04+) / Windows 10+
- `uv`
- NXD CLI (`nxd`) authenticated to your OS instance
- Access to the NXD package registry
- Deployed `product-catalog` data product (required for inputs / expectations / scheduling stages)

## Workspace setup

```bash
# Install CLI + uv (see docs/requirements/cli-setup.md)
curl -sSL https://nxd.partner.nextopia.dev/app/cli/install.sh | bash
nxd create config --url=https://nxd.partner.nextopia.dev/api
nxd login

# Install Python SDK deps from the NXD registry
uv sync
uv run python -c 'from nxd.spec import data_product; print("SDK ready!")'
```

## Launch

```bash
cd data_products/multi-channel-sales
nxd validate
nxd launch
nxd logs multi-channel-sales-demo
```

Browse: `https://nxd.partner.nextopia.dev/app/data-products/multi-channel-sales-demo?tab=manage`

## File-by-file workflow (`multi-channel-sales`)

```text
spec.py  ← wires inputs, transform triggers, multimodal outputs, contracts
  ├── spec_imports.py
  ├── models.py                  # channel_sales_velocity + product_catalog
  ├── contracts/verify.py        # output promise + input expectation
  ├── transform.py               # read S3 + Databricks catalog → write Snowflake/S3/ADLS
  └── requirements.txt
```

Runtime: sense schedule/upstream update → check expectations → transform → validate promises → promote Snowflake + S3 + ADLS ports.

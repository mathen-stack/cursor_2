# Build a data product - step by step

This series walks you through building a production-grade data product on Nextdata OS, adding one capability per tutorial.

**Prerequisites:** [NXD CLI installed](../cli/setup.md) and `uv` available. See [requirements](../cli/requirements.md) for the full environment checklist.

**What you'll build:** a `multi-channel-sales` data product that tracks sales velocity across channels and regions, writing to Snowflake, S3, and Azure Data Lake Storage.

## Quick start

Start here if you want a working data product in 10 minutes:

- [Quick start](quick-start.md) - build a `revenue-intelligence` data product end-to-end

## Build series

Work through these in order. Each tutorial adds a new capability to the same data product:

| Tutorial | What you add | Time |
|---|---|---|
| [01 - Semantic model](01-semantic-model.md) | Define the data schema and write to Snowflake | 15 min |
| [02 - Outputs](02-outputs.md) | Add S3 and Azure Data Lake Storage output ports | 15 min |
| [03 - Promises](03-promises.md) | Add output quality guarantees | 15 min |
| [04 - Inputs](04-inputs.md) | Consume data from upstream sources ¹ | 20 min |
| [05 - Expectations](05-expectations.md) | Validate input quality before the transform runs ¹ | 15 min |
| [06 - Scheduling](06-scheduling.md) | Run on a cron schedule and on upstream updates ¹ | 15 min |
| [07 - MCP](07-mcp.md) | Expose functions to AI assistants via MCP | 20 min |

¹ Requires a live `product-catalog` data product in your environment. Ask your platform administrator to confirm it is deployed.

## Other guides

- [Consumer tutorial](consumer-tutorial.md) - discover, query, and analyze data products as a data analyst
- [Policy tutorial](policy-tutorial.md) - implement automated governance across data products
- [Platform administration](platform-administration.md) - set up domains, infra profiles, and users

## Related

- [Developer quickstart](../cli/README.md) - faster path covering hello-world and core patterns

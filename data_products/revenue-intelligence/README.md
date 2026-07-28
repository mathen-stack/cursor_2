# revenue-intelligence-demo

Nextdata OS data product from the **Quick start** tutorial.

Generates SaaS customer revenue metrics (tier, MRR, health score) and writes them to Snowflake.

## Source tutorial

- [Quick start](https://nxd.partner.nextopia.dev/docs/#/tutorials/guides/quick-start)

## Files

| File | Role |
|---|---|
| `models.py` | `revenue_intelligence` semantic model |
| `transform.py` | Sample SaaS revenue generator → Snowflake |
| `spec_imports.py` | Spec DSL + model/transform re-exports |
| `spec.py` | Product definition with Snowflake output port |
| `requirements.txt` | Runtime Python dependencies |

## Domain

`finance/revenue` · infra profile `ecommerce-demo`

## Launch

```bash
nxd validate
nxd launch
nxd logs revenue-intelligence-demo
```

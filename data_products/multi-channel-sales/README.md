# multi-channel-sales-demo

Nextdata OS data product from the Nextopia **Build series** (stages 01–06).

Tracks **sales velocity across channels and regions**, writing the same `channel_sales_velocity` semantic to:

- Snowflake
- S3 (CSV)
- Azure Data Lake Storage (CSV)

## Source tutorials

1. [01 Semantic model](https://nxd.partner.nextopia.dev/docs/#/tutorials/guides/01-semantic-model)
2. [02 Outputs](https://nxd.partner.nextopia.dev/docs/#/tutorials/guides/02-outputs)
3. [03 Promises](https://nxd.partner.nextopia.dev/docs/#/tutorials/guides/03-promises)
4. [04 Inputs](https://nxd.partner.nextopia.dev/docs/#/tutorials/guides/04-inputs)
5. [05 Expectations](https://nxd.partner.nextopia.dev/docs/#/tutorials/guides/05-expectations)
6. [06 Scheduling](https://nxd.partner.nextopia.dev/docs/#/tutorials/guides/06-scheduling)

## Files

| File | Role |
|---|---|
| `models.py` | Output `channel_sales_velocity` + input `product_catalog` semantic models |
| `transform.py` | Load catalog from S3 + Databricks; generate/write velocity to 3 ports |
| `contracts/verify.py` | Output promise (`verify`) + input expectation (`product_catalog_expectation`) |
| `spec_imports.py` | Spec DSL + model/contract/transform re-exports |
| `spec.py` | Product definition: inputs, cron + upstream trigger, multimodal outputs |
| `requirements.txt` | Runtime Python dependencies |

## Triggers

- Cron: every 5 minutes (`*/5 * * * *`)
- Event: when `product-catalog-databricks` updates

## Domain

`retail/sales` · infra profile `ecommerce-demo`

## Launch

```bash
nxd validate
nxd launch
nxd logs multi-channel-sales-demo
```

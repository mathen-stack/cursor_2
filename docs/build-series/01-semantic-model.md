# Semantic model

Build a `multi-channel-sales` data product that tracks sales velocity across channels and regions. By the end you have a running data product writing to Snowflake.

**Estimated time:** 15 min

**Prerequisites:** Completed [Quick start](quick-start.md) or [CLI setup](../cli/setup.md). See [requirements](../cli/requirements.md) for the full environment checklist.

## Context

The `multi-channel-sales` data product tracks which products are selling faster in which channels and regions. Throughout the build series (tutorials 01-07) you add capabilities to this same data product.

## Before you begin

Continue in the `nxd-tutorials` folder created in the [setup tutorial](../cli/setup.md):

```bash
cd nxd-tutorials
nxd create data-product --template python-sdk multi-channel-sales-<yourname>
cd multi-channel-sales-<yourname>
```

The template generates `models.py`, `transform.py`, `spec.py`, and `requirements.txt`. The steps below replace those files with the build-series versions. You will also create `spec_imports.py` in Step 3.

## Step 1: Semantic model

A semantic model is storage-agnostic: it describes the schema and business meaning of your data without committing to where it lands. Edit `models.py`:

[models.py](fixtures/build/01-semantic-model/models.py ':include :type=code python')

Key points:

- `semantic_model("channel_sales_velocity")` - declares the model name used as the primary identifier.
- `.sampling(method=SamplingMethod.Random)` - enables Discovery Data so consumers can preview sample rows without querying the full table.
- `.description(...)` on the model and each field - these appear in the data catalog and are queryable by downstream consumers.

## Step 2: Transform

The transform contains the business logic that produces data. NXD injects context objects at runtime. Edit `transform.py`:

[transform.py](fixtures/build/01-semantic-model/transform.py ':include :type=code python')

Key points:

- `transform(snowflake_port: Snowflake)` - the parameter name `snowflake_port` maps to the port named `"snowflake_port"` in `spec.py` (hyphens in port names become underscores in function parameters).
- `snowflake_port.model_tables[model_name]` - resolves to the Snowflake table configured in the infra profile.
- `snowflake_port.user`, `.password`, `.account`, etc. are injected by the runtime - no credentials in code.

## Step 3: Imports

Create `spec_imports.py`:

[spec_imports.py](fixtures/build/01-semantic-model/spec_imports.py ':include :type=code python')

`__all__` must include every name that `spec.py` uses via `from spec_imports import *`.

## Step 4: Spec

Edit `spec.py`. Set `name` to `"multi-channel-sales-<yourname>"`:

[spec.py](fixtures/build/01-semantic-model/spec.py ':include :type=code python')

Key decisions:

- `.compute(...)` - points to the Kubernetes compute service from the `ecommerce-demo` infra profile.
- `.port("snowflake_port", storage(...))` - port name must match the parameter name in `transform` (after converting hyphens to underscores).

## Step 5: Requirements

Create `requirements.txt`:

[requirements.txt](fixtures/build/01-semantic-model/requirements.txt ':include :type=code text')

## Step 6: Launch

> **⚠️ Naming Reminder** - confirm `name="multi-channel-sales-<yourname>"` in `spec.py` before running.

```bash
nxd validate
nxd launch
nxd logs multi-channel-sales-<yourname>-demo
```

After deployment, browse to `https://nxd.partner.nextopia.dev/app/data-products/multi-channel-sales-<yourname>-demo?tab=manage`.

## What you learned

- Semantic models define schema and business meaning independently of storage.
- `.sampling()` enables Discovery Data - sample rows visible to consumers in the catalog.
- Transform parameters map to spec port names: hyphens in port names become underscores in function signatures.
- Context objects (`Snowflake`) are injected by the runtime; no credentials in code.

## Related

- [02 - Outputs](02-outputs.md) - add S3 and Azure Data Lake Storage output ports
- [03 - Promises](03-promises.md) - add output quality guarantees
- [Quick start](quick-start.md) - shorter end-to-end introduction

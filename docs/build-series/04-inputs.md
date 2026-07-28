# Inputs

Add two input sources to the `multi-channel-sales` data product: a source-aligned S3 file and a data product input from databricks. The transform reads from both before producing output.

**Estimated time:** 20 min

**Prerequisites:** Completed [03 - Promises](03-promises.md). See [requirements](../cli/requirements.md) for the full environment checklist.

> **Note:** This tutorial requires a live `product-catalog` data product in your environment. Ask your platform administrator to confirm it is deployed before continuing. Tutorials 05 and 06 share this dependency.

## Overview

Two input kinds are available:

- **Source-aligned input** (`source_aligned_input`) - reads from an external storage service (S3, ADLS, Snowflake table) directly.
- **Data product input** (`data_product_input`) - subscribes to an output port of another data product in the mesh.

## Step 1: Semantic models

Add the `product_catalog_semantic_model` that describes the upstream input. Edit `models.py`:

[models.py](fixtures/build/04-inputs/models.py ':include :type=code python')

The `product_catalog_semantic_model` defines the schema of the data you expect to receive from the upstream source. It also validates what you consume (see [05 - Expectations](05-expectations.md)).

## Step 2: Transform

The transform now receives two input contexts in addition to the three output contexts. Edit `transform.py`:

[transform.py](fixtures/build/04-inputs/transform.py ':include :type=code python')

Key points:

- `product_catalog_s3: S3Input` - injected by the runtime for the `"product_catalog_s3"` source-aligned input.
- `product_catalog_databricks: DatabricksRead` - injected for the `"product-catalog-databricks"` data product input. Note: hyphens in port names become underscores in parameter names.
- `load_from_s3(s3_in, model_name)` - uses the signed URL from `s3_in.model_urls[model_name]`.
- `load_from_databricks(databricks, model_name)` - queries using `databricks.model_tables[model_name]`.

## Step 3: Imports

Update `spec_imports.py` to add input-related symbols:

[spec_imports.py](fixtures/build/04-inputs/spec_imports.py ':include :type=code python')

## Step 4: Spec

Update `spec.py` to declare both inputs before the transform:

[spec.py](fixtures/build/04-inputs/spec.py ':include :type=code python')

Key decisions:

- `source_aligned_input().source(...).config(s3_config(...).target_file(..., model=product_catalog_semantic_model))` - points to the S3 file and associates it with the model.
- `data_product_input().source("https://nxd.partner.nextopia.dev/app/data-product/product-catalog#/output/port/nxd-databricks-storage")` - subscribes to the `product-catalog` data product's Databricks port.
- Input names (`"product_catalog_s3"`, `"product-catalog-databricks"`) map to transform parameter names after hyphen-to-underscore conversion.

## Step 5: Requirements

Update `requirements.txt` to add `requests` for S3 signed URL access:

[requirements.txt](fixtures/build/04-inputs/requirements.txt ':include :type=code text')

## Step 6: Launch

```bash
nxd validate
nxd launch
nxd logs multi-channel-sales-<yourname>-demo
```

After deployment, [https://nxd.partner.nextopia.dev/app/data-products/multi-channel-sales-<yourname>-demo?tab=manage](https://nxd.partner.nextopia.dev/app/data-products/multi-channel-sales-<yourname>-demo?tab=manage) shows the input lineage - both upstream sources appear as dependency nodes.

## What you learned

- `source_aligned_input` reads directly from an external storage service.
- `data_product_input` subscribes to another data product's output port and participates in mesh lineage.
- Transform parameter names must match input/output names with hyphens converted to underscores.
- `.target_file(path, model=...)` associates a file on S3 with a semantic model, enabling schema-aware reads.

## Related

- [05 - Expectations](05-expectations.md) - validate input quality before the transform runs
- [03 - Promises](03-promises.md) - previous step

# Promises

Add output quality guarantees to the `multi-channel-sales` data product. Promises run automatically after each transform execution and notify consumers of quality issues.

**Estimated time:** 15 min

**Prerequisites:** Completed [02 - Outputs](02-outputs.md). See [requirements](../cli/requirements.md) for the full environment checklist.

## Overview

A promise is a contractual guarantee about the quality of data your product produces. Two kinds:

- **Schema promise** - NXD verifies the output matches the declared semantic model schema.
- **Custom promise** - a Python function you write that inspects the data and returns a `VerifyResult`.

## Step 1: Semantic model and transform

No changes from [02 - Outputs](02-outputs.md). `models.py` and `transform.py` stay the same.

## Step 2: Verify function

Create `contracts/verify.py`. This custom promise reads the S3 output and checks data quality:

[contracts/verify.py](fixtures/build/03-promises/contracts/verify.py ':include :type=code python')

Key points:

- Function signature: `verify(s3_port: S3Input) -> VerifyResult` - NXD injects the S3 input context after the transform writes to that port.
- `s3_port.model_urls["channel_sales_velocity"]` - returns a signed URL for reading the written data.
- Return `VerifyResult(VerifyResultEnum.PASS, ...)` or `VerifyResult(VerifyResultEnum.FAILED, ...)`.

## Step 3: Imports

Update `spec_imports.py` to add `custom` and the `verify` function:

[spec_imports.py](fixtures/build/03-promises/spec_imports.py ':include :type=code python')

## Step 4: Spec

Update `spec.py` to attach promises to two output ports:

[spec.py](fixtures/build/03-promises/spec.py ':include :type=code python')

Key decisions:

- `s3_port` gets a custom promise: `.promise(custom("channel_sales_velocity_data_quality").verify(code(verify)))`.
- `adls_port` gets a schema promise: `.promise(channel_sales_velocity)` - NXD validates the output matches the model schema.
- `snowflake_port` has no promise in this tutorial, showing that promises are per-port.

## Step 5: Requirements

Same as [02 - Outputs](02-outputs.md):

[requirements.txt](fixtures/build/03-promises/requirements.txt ':include :type=code text')

## Step 6: Launch

```bash
nxd validate
nxd launch
nxd logs multi-channel-sales-<yourname>-demo
```

After deployment, browse to `https://nxd.partner.nextopia.dev/app/data-products/multi-channel-sales-<yourname>-demo?tab=manage`. The **Promises** section shows the result of each verification run.

## What you learned

- Schema promises (`promise(model)`) validate output structure automatically.
- Custom promises (`custom(...).verify(code(fn))`) let you write arbitrary quality checks in Python.
- The verify function receives an `S3Input` context - it reads what the transform just wrote.
- Promises run per port, not per data product.

## Related

- [04 - Inputs](04-inputs.md) - consume data from upstream sources
- [02 - Outputs](02-outputs.md) - previous step

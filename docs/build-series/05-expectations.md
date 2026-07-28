# Expectations

Add input quality validation to the `multi-channel-sales` data product. Expectations run before the transform and block execution if the input data does not meet quality requirements.

**Estimated time:** 15 min

**Prerequisites:** Completed [04 - Inputs](04-inputs.md). See [requirements](../cli/requirements.md) for the full environment checklist.

## Overview

An expectation is the input-side counterpart of a promise: while a promise guarantees what you produce, an expectation requires what you consume. Two kinds:

- **Schema expectation** - NXD validates the input against the declared semantic model schema.
- **Custom expectation** - a Python function that inspects the input and returns a `VerifyResult`.

## Step 1: Semantic models and transform

No changes from [04 - Inputs](04-inputs.md). `models.py` and `transform.py` stay the same.

## Step 2: Expectation and verify functions

Add `product_catalog_expectation` to `contracts/verify.py`. The file now holds both the output promise and the input expectation:

[contracts/verify.py](fixtures/build/05-expectations/contracts/verify.py ':include :type=code python')

Key points:

- `product_catalog_expectation(s3_port: S3Input) -> VerifyResult` - NXD passes the S3 input context so the function can read and check the data before the transform runs.
- If the expectation fails, the transform does not execute and the failure is reported in the data product status.

## Step 3: Imports

Update `spec_imports.py` to add `product_catalog_expectation`:

[spec_imports.py](fixtures/build/05-expectations/spec_imports.py ':include :type=code python')

## Step 4: Spec

Update `spec.py` to attach expectations to both inputs:

[spec.py](fixtures/build/05-expectations/spec.py ':include :type=code python')

Key decisions:

- `source_aligned_input().model(product_catalog_semantic_model)` - declares the expected schema for this input.
- `.expectation(product_catalog_semantic_model)` - schema expectation: validates the input matches the model.
- `.expectation(custom(...).verify(code(product_catalog_expectation)).model(...))` - custom expectation with model context.
- `data_product_input().expectation(product_catalog_semantic_model)` - schema expectation on the DP input.

## Step 5: Requirements and launch

Same as [04 - Inputs](04-inputs.md):

```bash
nxd validate
nxd launch
nxd logs multi-channel-sales-<yourname>-demo
```

Browse to [https://nxd.partner.nextopia.dev/app/data-products/multi-channel-sales-<yourname>-demo?tab=manage](https://nxd.partner.nextopia.dev/app/data-products/multi-channel-sales-<yourname>-demo?tab=manage). The **Expectations** section shows validation results for each input.

## What you learned

- Schema expectations (`expectation(model)`) validate input structure automatically.
- Custom expectations (`custom(...).verify(code(fn)).model(...)`) let you write arbitrary input checks.
- If any expectation fails, the transform does not run - protecting downstream outputs from bad data.
- The same `VerifyResult` type is used for both expectations and promises.

## Related

- [06 - Scheduling](06-scheduling.md) - control when the data product executes
- [04 - Inputs](04-inputs.md) - previous step

# Scheduling

Add scheduling to the `multi-channel-sales` data product so it runs on a cron interval and also re-runs when an upstream data product updates.

**Estimated time:** 15 min

**Prerequisites:** Completed [05 - Expectations](05-expectations.md). See [requirements](../cli/requirements.md) for the full environment checklist.

## Overview

Two scheduling primitives are available:

- **`scheduled(cron_expr)`** - runs the transform on a cron schedule.
- **`updated(input_name)`** - runs the transform whenever the named data product input publishes new data.
- **`any_of(...)`** - runs when any of the supplied conditions is true.

## Step 1: Models, transform, and contracts

No changes from [05 - Expectations](05-expectations.md). `models.py`, `transform.py`, and `contracts/verify.py` stay the same.

## Step 2: Imports

Update `spec_imports.py` to add scheduling symbols:

[spec_imports.py](fixtures/build/06-scheduling/spec_imports.py ':include :type=code python')

## Step 3: Spec

The only change from [05 - Expectations](05-expectations.md) is the `.when(...)` call on the transform:

[spec.py](fixtures/build/06-scheduling/spec.py ':include :type=code python')

Key decisions:

- `.when(any_of(scheduled("*/5 * * * *"), updated("product-catalog-databricks")))` - the transform runs every 5 minutes OR whenever `product-catalog-databricks` publishes new data, whichever comes first.
- `updated("product-catalog-databricks")` - the input name must match the `.input("product-catalog-databricks", ...)` declaration.
- Without `.when(...)`, the transform has no recurring trigger - it only runs when explicitly re-launched. To also run once on first deploy, pass `startup=True` inside `.when(...)`: `.when(scheduled(...), startup=True)`.

## Step 4: Launch

```bash
nxd validate
nxd launch
nxd logs multi-channel-sales-<yourname>-demo
```

Browse to `https://nxd.partner.nextopia.dev/app/data-products/multi-channel-sales-<yourname>-demo?tab=manage`. The **Execution** tab shows scheduled runs and event-triggered runs separately.

## What you learned

- `scheduled(cron)` runs on a time interval; standard cron syntax.
- `updated(input_name)` triggers when an upstream data product produces new data, enabling event-driven pipelines.
- `any_of(...)` combines conditions: the transform runs when any is satisfied.
- Scheduling is part of the spec, not the transform - the business logic stays the same.

## Related

- [07 - MCP](07-mcp.md) - expose your data product functions to AI assistants
- [05 - Expectations](05-expectations.md) - previous step

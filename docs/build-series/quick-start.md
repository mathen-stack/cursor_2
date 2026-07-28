# Quick start

Build a revenue intelligence data product that generates customer analytics and writes them to Snowflake. Takes under 10 minutes.

**Estimated time:** 10 min

**Prerequisites:** [NXD CLI installed](../cli/setup.md) and `uv` available. See [requirements](../cli/requirements.md) for the full environment checklist.

## Step 1: Set up a project

Create an empty project directory, then add the data product scaffold:

```bash
mkdir revenue-intelligence && cd revenue-intelligence
nxd create data-product --template python-sdk revenue-intelligence-<yourname>
```

Replace `<yourname>` with your username to avoid naming collisions.

## Step 2: Define the semantic model

A semantic model describes the structure and business meaning of the data your product publishes. Edit `models.py`:

[models.py](fixtures/build/quick-start/models.py ':include :type=code python')

`semantic_model("revenue_intelligence")` declares the schema and description. Consumers can read these fields without querying your data.

## Step 3: Write the transform

The transform is where business logic runs. NXD injects the Snowflake context object at runtime - no connection strings in code. Edit `transform.py`:

[transform.py](fixtures/build/quick-start/transform.py ':include :type=code python')

Key points:

- `transform(snowflake_out: Snowflake)` - parameter name matches the port name `"snowflake_out"` declared in `spec.py`.
- `snowflake_out.model_tables[model_name]` - resolves to the Snowflake table configured in the infra profile.
- `snowflake_out.user`, `.password`, `.account`, etc. are injected by the runtime from the infra profile credentials.

## Step 4: Imports

Create `spec_imports.py`. This separates imports from the spec definition and makes `__all__` a clear record of what the spec needs:

[spec_imports.py](fixtures/build/quick-start/spec_imports.py ':include :type=code python')

## Step 5: Spec

Edit `spec.py`. Set `name` to `"revenue-intelligence-<yourname>"` to avoid collisions:

[spec.py](fixtures/build/quick-start/spec.py ':include :type=code python')

Key decisions:

- `.compute(...)` - points to the Kubernetes compute service in the `ecommerce-demo` infra profile.
- `.port("snowflake_out", ...)` - declares the output port. The port name matches the `snowflake_out` parameter in `transform`.

## Step 6: Requirements

Create `requirements.txt`:

[requirements.txt](fixtures/build/quick-start/requirements.txt ':include :type=code text')

## Step 7: Launch

> **⚠️ Naming Reminder** - confirm `name="revenue-intelligence-<yourname>"` in `spec.py` before running.

```bash
nxd validate
nxd launch
nxd logs revenue-intelligence-<yourname>-demo
```

- `nxd validate` - parses and validates your spec locally without launching.
- `nxd launch` - packages and deploys the data product to the platform.
- `nxd logs` - streams execution logs from the running transform.

After deployment, browse to `https://nxd.partner.nextopia.dev/app/data-products/revenue-intelligence-<yourname>-demo?tab=manage`.

## What you learned

- Semantic models describe data structure and business meaning without coupling to a storage system.
- Transform functions receive context objects (`Snowflake`) injected by the runtime.
- `spec.py` wires model, transform, compute, and output port into a deployable unit.
- `nxd validate` catches spec errors before launch.

## Related

- [01 - Semantic model](01-semantic-model.md) - detailed walkthrough of semantic model design
- [02 - Outputs](02-outputs.md) - write to multiple storage destinations simultaneously
- [Developer quickstart](../cli/README.md) - step-by-step walkthrough of the same pattern

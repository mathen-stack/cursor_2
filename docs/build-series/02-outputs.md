# Outputs

Add Snowflake, S3, and Azure Data Lake Storage output ports to the `multi-channel-sales` data product. The transform writes to all three destinations simultaneously.

**Estimated time:** 15 min

**Prerequisites:** Completed [01 - Semantic model](01-semantic-model.md). See [requirements](../cli/requirements.md) for the full environment checklist.

## Step 1: Semantic model

The model gains `.sampling()` and `.link()` compared to the previous tutorial. Edit `models.py`:

[models.py](fixtures/build/02-outputs/models.py ':include :type=code python')

Key additions:

- `.sampling(method=SamplingMethod.Random)` - enables Discovery Data.
- `.link("product_id", Predicate.SameAs, ...)` - creates a semantic connection to another data product's model attribute. These links appear as cross-references in the data catalog.

## Step 2: Transform

The transform now writes to three destinations. Edit `transform.py`:

[transform.py](fixtures/build/02-outputs/transform.py ':include :type=code python')

Key points:

- `transform(snowflake_port, s3_port, adls_port)` - three injected context objects, one per output port. Parameter names map to port names in `spec.py` (hyphens become underscores).
- `s3_port: S3Output` - injected for the `"s3_port"` output port. The fixture passes it to the `save_df_to_s3` helper, which receives it as `s3_out` - a local rename, not the injected name.
- `adls_port: AzureDataLakeStorage` - injected for the `"adls_port"` output port. Similarly passed to `save_df_to_adls` as `azure_storage`.
- `s3_port.model_output_paths[model_name]` - resolves to the S3 key configured in the infra profile.
- `adls_port.model_paths[model_name].path` - resolves to the ADLS path configured in the infra profile.

## Step 3: Imports

Update `spec_imports.py` to include the S3 and ADLS config helpers:

[spec_imports.py](fixtures/build/02-outputs/spec_imports.py ':include :type=code python')

## Step 4: Spec

Update `spec.py` to add three output ports:

[spec.py](fixtures/build/02-outputs/spec.py ':include :type=code python')

Key decisions:

- `.port("s3_port", storage(...).config(s3_config(...)))` - the port name `s3_port` maps to the `s3_port` parameter in `transform`.
- `.port("adls_port", storage(...).config(adls_config(...)))` - similarly maps to `adls_port`.
- `SupportedFormat.CSV` - instructs the runtime to write CSV files to both S3 and ADLS.

## Step 5: Requirements

Update `requirements.txt` to add S3 and Azure dependencies:

[requirements.txt](fixtures/build/02-outputs/requirements.txt ':include :type=code text')

## Step 6: Launch

```bash
nxd validate
nxd launch
nxd logs multi-channel-sales-<yourname>-demo
```

After deployment, browse to `https://nxd.partner.nextopia.dev/app/data-products/multi-channel-sales-<yourname>-demo?tab=manage`. Verify the three output ports are healthy in the manage tab.

## What you learned

- A data product can declare multiple output ports targeting different storage systems.
- Each port name maps directly to a parameter name in the transform function (hyphens → underscores).
- `s3_config()` and `adls_config()` control file format and path conventions for file-based outputs.
- `.link()` on a semantic model establishes cross-product references visible in the data catalog.

## Related

- [03 - Promises](03-promises.md) - add output quality guarantees to these ports
- [01 - Semantic model](01-semantic-model.md) - previous step

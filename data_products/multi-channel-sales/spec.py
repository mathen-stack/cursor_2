# ruff: noqa: F403, F405
from spec_imports import *

spec = (
    data_product(
        name="multi-channel-sales-demo",
        domain="retail/sales",
        description=(
            "Trending and emerging products sold across all channels. Transactional and "
            "channel-specific sales performance across regions, products, and sales touchpoints."
        ),
        version="202506.03000000.001-dev",
        infra_profile="ecommerce-demo",
    )
    .input(
        "product_catalog_s3",
        source_aligned_input()
        .source("https://nxd.partner.nextopia.dev/app/infra-profile/ecommerce-demo#/services/s3-output")
        .config(
            s3_config(SupportedFormat.CSV).target_file(
                "product-catalog/demo/product_catalog.csv",
                model=product_catalog_semantic_model,
            )
        )
        .model(product_catalog_semantic_model)
        .expectation(product_catalog_semantic_model)
        .expectation(
            custom("product_catalog_expectation")
            .verify(code(product_catalog_expectation))
            .model(product_catalog_semantic_model)
        ),
    )
    .input(
        "product-catalog-databricks",
        data_product_input()
        .source("https://nxd.partner.nextopia.dev/app/data-product/product-catalog#/output/port/nxd-databricks-storage")
        .expectation(product_catalog_semantic_model),
    )
    .transform(
        code(transform)
        .when(any_of(scheduled("*/5 * * * *"), updated("product-catalog-databricks")))
        .compute("https://nxd.partner.nextopia.dev/app/infra-profile/ecommerce-demo#/services/k8s-compute")
    )
    .output(
        data_product_output()
        .model(channel_sales_velocity)
        .port(
            "snowflake_port",
            storage("https://nxd.partner.nextopia.dev/app/infra-profile/ecommerce-demo#/services/nxd-snowflake"),
        )
        .port(
            "s3_port",
            storage("https://nxd.partner.nextopia.dev/app/infra-profile/ecommerce-demo#/services/s3-output")
            .config(s3_config(file_type=SupportedFormat.CSV))
            .promise(custom("channel_sales_velocity_data_quality").verify(code(verify))),
        )
        .port(
            "adls_port",
            storage("https://nxd.partner.nextopia.dev/app/infra-profile/ecommerce-demo#/services/adls")
            .config(adls_config(file_type=SupportedFormat.CSV))
            .promise(channel_sales_velocity),
        )
    )
)

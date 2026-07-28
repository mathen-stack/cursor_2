# ruff: noqa: F403, F405
from spec_imports import *

spec = (
    data_product(
        name="revenue-intelligence-demo",
        domain="finance/revenue",
        description=(
            "Revenue Intelligence Data Product: Revenue analytics with automated customer "
            "segmentation, health scoring, and forecasting capabilities. Provides multi-modal "
            "access to revenue intelligence for executive dashboards, sales operations, and "
            "customer success teams."
        ),
        version="1.0.0-dev",
        infra_profile="ecommerce-demo",
    )
    .transform(code(transform).compute("https://nxd.partner.nextopia.dev/app/infra-profile/ecommerce-demo#/services/k8s-compute"))
    .output(
        data_product_output()
        .model(revenue_intelligence)
        .port(
            "snowflake_out",
            storage(
                "https://nxd.partner.nextopia.dev/app/infra-profile/ecommerce-demo#/services/nxd-snowflake"
            ).enable_temporal_credentials(),
        )
    )
)

from nxd.spec import Predicate
from nxd.spec import SamplingMethod
from nxd.spec import semantic_model
from nxd.spec.data_types import boolean
from nxd.spec.data_types import float64
from nxd.spec.data_types import int32
from nxd.spec.data_types import int64
from nxd.spec.data_types import string

channel_sales_velocity = (
    semantic_model("channel_sales_velocity")
    .description(
        "Measures and compares the rate of sales growth per channel, adjusted for seasonal and historical trends."
    )
    .sampling(method=SamplingMethod.Random)
    .schema(
        {
            "product_id": (
                string(),
                "Identifier for the product whose sales velocity is being measured.",
            ),
            "sales_channel": (
                string(),
                "Sales channel from which transaction data was aggregated.",
            ),
            "region": (string(), "Region inferred from the source of sales activity."),
            "velocity_score": (
                float64(),
                "Normalized score calculated by comparing recent sales to historical trends for the same product, channel, and region.",
            ),
            "units_sold_last_7_days": (int32(), "Units sold last 7 days"),
            "units_sold_previous_7_days": (int32(), "Units sold previous 7 days"),
            "sales_change_percent": (
                float64(),
                "Percent change in units sold between the last 7 days and the prior 7-day period.",
            ),
            "sales_trend": (
                string(),
                "Trend direction derived from comparing sales volume change to defined thresholds.",
            ),
        }
    )
    .link(
        "product_id",
        Predicate.SameAs,
        "https://nxd.partner.nextopia.dev/app/data-product/demo/product-catalog#/models/product_catalog/attributes/product_code",
    )
    .link(
        "region",
        Predicate.SameAs,
        "https://nxd.partner.nextopia.dev/app/data-product/demo/store-sales#/models/pos-sell-out/attributes/region_id",
    )
)

product_catalog_semantic_model = (
    semantic_model("product_catalog")
    .description("Core product catalog representing all manufactured products that can be sold")
    .schema(
        {
            "product_code": (int64(), "The value of the identifying code of the product"),
            "gtin": (int64(), "Global Trade Item Number - the global product identifier"),
            "title": (string(), "The name of the product"),
            "short_description": (string(), "Shortened description of the product"),
            "product_description": (string(), "Full description of the product"),
            "is_active_product": (
                boolean(),
                "Indicator to show if the product is actively being manufactured and sold",
            ),
            "iri_category_name": (
                string(),
                "The leaf node in the IRI Hierarchy external product classification system",
            ),
            "iri_subcategory_name": (string(), "The higher-than-leaf node in the IRI Hierarchy classification system"),
            "pack_size": (int64(), "Indicator of the number of units in this pack"),
            "manufacturer": (string(), "The name of the manufacturer who manufactured this product"),
            "brand": (string(), "Brand associated with the product"),
            "sub_brand": (string(), "Sub-brand associated with the product"),
        }
    )
)

from nxd.spec import semantic_model
from nxd.spec.data_types import float64
from nxd.spec.data_types import string

revenue_intelligence = (
    semantic_model("revenue_intelligence")
    .description(
        "Revenue Intelligence: Standardized customer revenue metrics and segmentation "
        "for executive dashboards, sales operations, and customer success teams. "
        "Provides single source of truth for customer value assessment and forecasting."
    )
    .schema(
        {
            "customer_id": (
                string(),
                "Unique customer identifier - primary key for joining with CRM and billing systems",
            ),
            "revenue_tier": (
                string(),
                "Revenue-based customer segmentation: Enterprise ($10K+ ARR), Growth ($1K-$10K ARR), Starter (<$1K ARR)",
            ),
            "monthly_recurring_revenue": (
                float64(),
                "Monthly Recurring Revenue (MRR) in USD - core metric for SaaS revenue forecasting and growth tracking",
            ),
            "customer_health_score": (
                float64(),
                "Customer health indicator (0-100) based on satisfaction surveys, usage patterns, and support interactions",
            ),
        }
    )
)

import random
from typing import Optional

import pandas as pd
from models import revenue_intelligence
from nxd.data_product.context import Snowflake
from snowflake import connector
from snowflake.connector.pandas_tools import write_pandas


def save_to_data_warehouse(snowflake_out: Optional[Snowflake], df: pd.DataFrame, model_name: str):
    if snowflake_out is not None:
        conn = connector.connect(
            user=snowflake_out.user,
            password=snowflake_out.password,
            account=snowflake_out.account,
            warehouse=snowflake_out.warehouse,
            role=snowflake_out.role,
            database=snowflake_out.database,
            schema=snowflake_out.schema,
            ocsp_fail_open=True,
        )
        original_columns = df.columns.copy()
        df.columns = df.columns.str.upper()
        conn.cursor().execute(f"TRUNCATE TABLE {snowflake_out.model_tables[model_name]};")
        write_pandas(
            conn,
            df,
            snowflake_out.model_tables[model_name],
            snowflake_out.database,
            snowflake_out.schema,
            auto_create_table=True,
        )
        df.columns = original_columns


def _generate_saas_revenue_data(num_customers=100) -> pd.DataFrame:
    customers = []
    tiers = [
        ("Enterprise", 0.15, (10000, 50000)),
        ("Growth", 0.25, (1000, 10000)),
        ("Starter", 0.60, (50, 1000)),
    ]
    for i in range(num_customers):
        rand = random.random()
        if rand < 0.15:
            tier, _, arr_range = tiers[0]
        elif rand < 0.40:
            tier, _, arr_range = tiers[1]
        else:
            tier, _, arr_range = tiers[2]
        annual_revenue = random.uniform(*arr_range)
        mrr = round(annual_revenue / 12, 2)
        health = round(
            random.uniform(75, 95)
            if tier == "Enterprise"
            else random.uniform(60, 85)
            if tier == "Growth"
            else random.uniform(40, 75),
            1,
        )
        customers.append(
            {
                "customer_id": f"CUST-{10000 + i}",
                "revenue_tier": tier,
                "monthly_recurring_revenue": mrr,
                "customer_health_score": health,
            }
        )
    return pd.DataFrame(customers)


def transform(snowflake_out: Snowflake):
    revenue_data = _generate_saas_revenue_data(100)
    save_to_data_warehouse(snowflake_out, revenue_data, revenue_intelligence.name)

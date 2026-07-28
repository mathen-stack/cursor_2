import random
from io import BytesIO
from io import StringIO
from typing import Optional

import boto3
import pandas as pd
import requests
from azure.identity import ClientSecretCredential
from azure.storage.filedatalake import DataLakeServiceClient
from botocore.config import Config as BotoConfig
from databricks import sql
from models import channel_sales_velocity
from nxd.data_product.context import AzureDataLakeStorage
from nxd.data_product.context import DatabricksRead
from nxd.data_product.context import S3Input
from nxd.data_product.context import S3Output
from nxd.data_product.context import Snowflake
from snowflake import connector
from snowflake.connector import connect
from snowflake.connector.pandas_tools import write_pandas


def _df_to_str(df: pd.DataFrame) -> str:
    out = StringIO()
    df.to_csv(out, index=False)
    return out.getvalue()


def _get_azure_client(azure_storage: AzureDataLakeStorage) -> DataLakeServiceClient:
    credentials = ClientSecretCredential(azure_storage.tenant_id, azure_storage.client_id, azure_storage.client_secret)
    return DataLakeServiceClient(
        account_url=f"https://{azure_storage.account_name}.dfs.core.windows.net",
        credential=credentials,
    )


def load_from_s3(s3_in: S3Input, model_name: str) -> pd.DataFrame:
    signed_url = s3_in.model_urls[model_name]
    return pd.read_csv(BytesIO(requests.get(signed_url).content), encoding="utf-8")


def load_from_databricks(databricks: DatabricksRead, model_name: str) -> pd.DataFrame:
    with sql.connect(
        server_hostname=databricks.host,
        http_path=databricks.http_path,
        access_token=databricks.token,
    ) as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {databricks.full_table_name(model_name)}")
        return cursor.fetchall_arrow().to_pandas()


def load_from_snowflake(snowflake: Snowflake, model_name: str) -> pd.DataFrame:
    conn = connect(
        account=snowflake.account,
        user=snowflake.user,
        password=snowflake.password,
        warehouse=snowflake.warehouse,
        database=snowflake.database,
        schema=snowflake.schema,
        role=snowflake.role,
    )
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM {snowflake.model_tables[model_name]}")
    return cur.fetch_pandas_all()


def save_df_to_adls(azure_storage: AzureDataLakeStorage, df: pd.DataFrame, model_name: str):
    file_path = azure_storage.model_paths[model_name].path
    service_client = _get_azure_client(azure_storage)
    file_client = service_client.get_file_system_client(file_system=azure_storage.container).get_file_client(file_path)
    file_client.upload_data(_df_to_str(df), overwrite=True)


def save_df_to_s3(s3_out: S3Output, df: pd.DataFrame, model_name: str):
    file_name = s3_out.model_output_paths[model_name]
    client = boto3.client(
        "s3",
        aws_access_key_id=s3_out.aws_access_key_id,
        aws_secret_access_key=s3_out.aws_secret_access_key,
        config=BotoConfig(region_name=s3_out.region_name),
    )
    client.put_object(
        Bucket=s3_out.bucket,
        Key=file_name,
        Body=_df_to_str(df),
        ContentType="text/csv",
    )


def save_df_to_snowflake(snowflake_out: Optional[Snowflake], df: pd.DataFrame, model_name: str):
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


def _generate_sample_data(num_records: int) -> pd.DataFrame:
    data = []
    for _ in range(num_records):
        units_last = random.randint(1, 1000)
        units_prev = random.randint(1, 1000)
        change_pct = round((units_last - units_prev) / units_prev * 100, 2) if units_prev > 0 else 0.0
        data.append(
            {
                "product_id": str(random.randint(1, 1000)),
                "sales_channel": random.choice(["Online", "Retail", "Wholesale", "Direct"]),
                "region": random.choice(["North America", "Europe", "Asia", "South America", "Africa"]),
                "velocity_score": round(random.uniform(0, 100), 2),
                "units_sold_last_7_days": units_last,
                "units_sold_previous_7_days": units_prev,
                "sales_change_percent": change_pct,
                "sales_trend": ("Increasing" if change_pct > 10 else "Decreasing" if change_pct < -10 else "Stable"),
            }
        )
    return pd.DataFrame(data)


def transform(
    product_catalog_s3: S3Input,
    product_catalog_databricks: DatabricksRead,
    snowflake_port: Snowflake,
    s3_port: S3Output,
    adls_port: AzureDataLakeStorage,
):
    catalog_sf = load_from_databricks(product_catalog_databricks, "product_catalog")
    print(f"Loaded {len(catalog_sf)} product catalog records from Databricks")
    catalog_s3 = load_from_s3(product_catalog_s3, "product_catalog")
    print(f"Loaded {len(catalog_s3)} product catalog records from S3")

    df = _generate_sample_data(20)
    save_df_to_snowflake(snowflake_port, df, channel_sales_velocity.name)
    save_df_to_s3(s3_port, df, channel_sales_velocity.name)
    save_df_to_adls(adls_port, df, channel_sales_velocity.name)

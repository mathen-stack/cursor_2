from io import BytesIO

import pandas as pd
import requests
from nxd.data_product.context import S3Input
from nxd.data_product.context import VerifyResult
from nxd.data_product.context import VerifyResultEnum


def verify(s3_port: S3Input) -> VerifyResult:
    signed_url = s3_port.model_urls["channel_sales_velocity"]
    df = pd.read_csv(BytesIO(requests.get(signed_url).content), encoding="utf-8")

    if df.empty:
        return VerifyResult(VerifyResultEnum.FAILED, {"result": "Data is empty."})
    if df.isnull().values.any():
        return VerifyResult(VerifyResultEnum.FAILED, {"result": "Data contains null values."})
    if (df["velocity_score"] < 0).any():
        return VerifyResult(VerifyResultEnum.FAILED, {"result": "'velocity_score' contains negative values."})
    return VerifyResult(VerifyResultEnum.PASS, {"result": "Good quality data."})


def product_catalog_expectation(s3_port: S3Input) -> VerifyResult:
    df = pd.read_csv(BytesIO(requests.get(s3_port.model_urls["product_catalog"]).content), encoding="utf-8")

    if df.empty:
        return VerifyResult(VerifyResultEnum.FAILED, {"result": "Product catalog is empty."})
    if df.isnull().values.any():
        return VerifyResult(VerifyResultEnum.FAILED, {"result": "Product catalog contains null values."})
    return VerifyResult(VerifyResultEnum.PASS, {"result": "Product catalog meets expectations."})

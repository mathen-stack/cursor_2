# ruff: noqa: F403, F405
from spec_imports import *

spec = (
    data_product(
        name="ai-mcp-assistant-tools-demo",
        domain="examples",
        description="Data product exposing calculator functions as MCP tools for AI assistants.",
        version="0.1.0-dev",
        infra_profile="ecommerce-demo",
    )
    .output(
        data_product_output()
        .model(add_response)
        .port(
            "mcp-output",
            storage(
                "https://nxd.partner.nextopia.dev/app/infra-profile/ecommerce-demo#/services/s3-output",
                "mcp-output-service",
            ),
        )
    )
    .control(
        "data product access control",
        data_product_access().user("hello@nextdata.com").description("Policy to control access to the data product"),
    )
    .output(
        data_product_rpc_output()
        .function(
            rpc_function(code(add_numbers), add_request, add_response).description(
                "Add two numbers together and return the result"
            )
        )
        .port(
            "mcp-api",
            rpc_server("https://nxd.partner.nextopia.dev/app/infra-profile/ecommerce-demo#/services/mcp-api-service-k8s")
            .enable_endpoints()
            .mcp_path("/mcp"),
        )
    )
)

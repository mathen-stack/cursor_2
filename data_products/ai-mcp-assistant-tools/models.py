from nxd.spec import semantic_model
from nxd.spec.data_types import double
from nxd.spec.data_types import string

add_request = (
    semantic_model("add_request")
    .description("Request model for add operation")
    .schema(
        {
            "a": (double(), "First number to add"),
            "b": (double(), "Second number to add"),
        }
    )
)

add_response = (
    semantic_model("add_response")
    .description("Response model for add operation")
    .schema(
        {
            "result": (double(), "The sum of a and b"),
            "operation": (string(), "Human readable description of the operation"),
        }
    )
)

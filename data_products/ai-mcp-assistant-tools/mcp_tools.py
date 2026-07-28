from nxd.drivers.rpc import Request
from nxd.drivers.rpc import Response
from nxd.drivers.rpc import function
from nxd.drivers.rpc import mcp


@function(name="add_numbers")
@mcp.tool(name="calculator", description="Add two numbers together")
def add_numbers(request: Request) -> Response:
    a = float(request.get("a", 0) or 0)
    b = float(request.get("b", 0) or 0)
    result = a + b
    return Response({"result": result, "operation": f"{a} + {b} = {result}"})

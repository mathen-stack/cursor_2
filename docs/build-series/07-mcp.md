# MCP tools

Expose data product functions as Model Context Protocol (MCP) tools so AI assistants can call them directly.

**Estimated time:** 20 min

**Prerequisites:** [NXD CLI installed](../cli/setup.md). This tutorial starts a new data product separate from the `multi-channel-sales` series. See [requirements](../cli/requirements.md) for the full environment checklist.

## Overview

MCP is a standardized protocol that lets AI assistants discover and call functions exposed by a server. A data product can host an MCP server as an output port. The functions you expose are written as ordinary Python and decorated to declare their input/output schemas.

## Before you begin

This tutorial creates a separate data product from the `multi-channel-sales` build series. Continue in the `nxd-tutorials` folder:

```bash
cd nxd-tutorials
nxd create data-product --template python-sdk ai-mcp-assistant-tools-<yourname>
cd ai-mcp-assistant-tools-<yourname>
```

The steps below replace the generated files with the MCP-specific versions.

## Step 1: Semantic models

Create `models.py` with request and response models for a calculator tool:

[models.py](fixtures/build/07-mcp/models.py ':include :type=code python')

`add_request` and `add_response` define the schema for the tool's input and output. AI assistants use these schemas to understand what parameters to send and what to expect back.

## Step 2: MCP tool function

Create `mcp_tools.py` with the tool implementation:

[mcp_tools.py](fixtures/build/07-mcp/mcp_tools.py ':include :type=code python')

Key points:

- `@function(name="add_numbers")` - registers the function with the NXD runtime.
- `@mcp.tool(name="calculator", description="...")` - exposes it as an MCP tool. The `description` is what AI assistants read to decide when to call the tool.
- `request: Request` / `Response(...)` - the runtime handles serialization; you work with plain dict-like objects.

## Step 3: Imports

Create `spec_imports.py`:

[spec_imports.py](fixtures/build/07-mcp/spec_imports.py ':include :type=code python')

## Step 4: Spec

Create `spec.py`. Set `name` to `"ai-mcp-assistant-tools-<yourname>"`:

[spec.py](fixtures/build/07-mcp/spec.py ':include :type=code python')

Key decisions:

- `data_product_rpc_output()` - declares the MCP output port.
- `rpc_function(code(add_numbers), add_request, add_response)` - wires the function to its request and response models.
- `rpc_server(...).enable_endpoints().mcp_path("/mcp")` - starts the MCP server on the `/mcp` endpoint.
- `data_product_access().user("hello@nextdata.com")` - controls who can call the MCP server. Replace with your email - run `nxd whoami` to find it.

## Step 5: Requirements

Create `requirements.txt`:

[requirements.txt](fixtures/build/07-mcp/requirements.txt ':include :type=code text')

## Step 6: Launch

```bash
nxd validate
nxd launch
nxd logs ai-mcp-assistant-tools-<yourname>-demo
```

After deployment, browse to `https://nxd.partner.nextopia.dev/app/data-products/ai-mcp-assistant-tools-<yourname>-demo?tab=manage`.

To connect and test your MCP server, follow the [MCP tools consumer guide](../../basics/using_mcp.md). It covers configuring an AI assistant to discover the tool and invoking the `calculator` function.

## What you learned

- `@mcp.tool` decorates a function to expose it as an MCP tool with a name and description AI assistants can read.
- `data_product_rpc_output()` declares the MCP server port in the spec.
- `rpc_function(code(fn), request_model, response_model)` wires the function to its schema.
- Access control is part of the spec via `.control(...)`.

## Related

- [06 - Scheduling](06-scheduling.md) - previous step in the build series
- [Quick start](quick-start.md) - back to basics
- [LLMs and genAI](../../examples/llms/llms.md) - AI data products
- [MCP tools](../../basics/using_mcp.md) - interact with your MCP tools

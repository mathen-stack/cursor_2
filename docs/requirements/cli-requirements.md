# Requirements

All CLI tutorials and build series guides share these requirements.

## Operating system

- **macOS** 12 or later
- **Linux** (Ubuntu 20.04 or later recommended)
- **Windows 10 or 11** with PowerShell 5.1 or later

## uv

`uv` manages Python versions and project dependencies. Install it in [setup](setup.md) step 3.

## Python (Windows only)

On macOS and Linux, `uv` downloads and installs Python automatically the first time you run an `nxd` command - no separate installation needed.

On Windows, `uv` does the same in most environments - it downloads a managed Python on first use. No separate installation needed.

On restricted corporate machines where `uv python install` is blocked by policy (AppLocker/WDAC), install Python manually before running the NXD CLI:

- Windows x64: Python 3.10 or later
- Windows ARM64: Python 3.11 or later

Download from [python.org](https://www.python.org/downloads/). During installation, select "Install for me only" to avoid requiring administrator privileges.

## NXD CLI

The NXD CLI (`nxd`) creates, launches, and manages data products. Install and authenticate it in [setup](setup.md).

## NXD registry access

NXD packages (`nxd-core`, `nxd-drivers`, `nxd-data-product`) are hosted in the NXD package registry. Access is configured via `[[tool.uv.index]]` in `pyproject.toml`. This is covered in [setup](setup.md) step 4.

## NXD OS instance

You need access to a deployed Nextdata OS platform. Your platform administrator provides the API URL. Authenticate in [setup](setup.md) step 2.

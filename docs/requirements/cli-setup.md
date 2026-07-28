# Tutorial - Local setup

**Estimated time:** 10 min

**What you'll add:** NXD CLI and Python SDK ready for development in your IDE.

**Requirements:** See [requirements](requirements.md) for the full environment checklist before starting.

## Step 1: Install nxd

<!-- tabs:start -->

### **macOS / Linux**

```bash
curl -sSL https://nxd.partner.nextopia.dev/app/cli/install.sh | bash
```

### **Windows (PowerShell)**

> **Requirements:** Windows 10 or 11 with PowerShell 5.1 or later.

```powershell
iwr https://nxd.partner.nextopia.dev/app/cli/install.ps1 -UseBasicParsing | iex
```

> **Restricted corporate environments:** On most Windows machines, `nxd` downloads and installs Python automatically on first use. If your machine blocks `uv python install` (e.g. AppLocker/WDAC policy), install Python manually from [python.org](https://www.python.org/downloads/) before running `nxd` commands. Select "Install for me only" during setup to avoid the administrator prompt. Minimum version: Python 3.10 on x64, Python 3.11 on ARM64. Once Python is on PATH, the CLI finds it automatically.

<!-- tabs:end -->

Verify the installation:
```bash
nxd --version
```

If `nxd: command not found`, the install directory is not on PATH. Add it:

<!-- tabs:start -->

### **macOS / Linux**

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add to `~/.zshrc` or `~/.bashrc` to persist across sessions.

### **Windows (PowerShell)**

```powershell
$env:PATH = "$env:USERPROFILE\.local\bin;$env:PATH"
```

To persist, add the line above to your PowerShell profile (`$PROFILE`).

<!-- tabs:end -->

## Step 2: Configure

Point the CLI at your API endpoint and authenticate:

```bash
nxd create config --url=https://nxd.partner.nextopia.dev/api
```

<!-- tabs:start -->

### **macOS / Linux**

```bash
nxd login
```

### **Windows (PowerShell)**

```powershell
nxd login
```

<!-- tabs:end -->

You will be prompted to log in with your credentials. Once authenticated, the CLI stores a session token locally.

If the browser shows a security warning on the redirect page, a stale token may be the cause. Delete `~/.nxd/tokens.json` (Windows: `%USERPROFILE%\.nxd\tokens.json`) and run `nxd login` again.

## Step 3: Install `uv`

`uv` is a fast Python package manager used to manage project dependencies.

<!-- tabs:start -->

### **macOS / Linux**

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### **Windows (PowerShell)**

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

<!-- tabs:end -->

## Step 4: Set up your workspace

This step creates the project folder, connects your IDE, and configures the project. You will reuse this workspace across all tutorials.

> **Note:** "Create `filename`" throughout these tutorials means create the file in your IDE or editor and paste the shown content. It is not a terminal command.

### Create the project folder

<!-- tabs:start -->

### **macOS / Linux**

Run from your terminal:

```bash
mkdir nxd-tutorials
cd nxd-tutorials
```

### **Windows (PowerShell)**

```powershell
mkdir nxd-tutorials
cd nxd-tutorials
```

<!-- tabs:end -->

### Set up your IDE

<!-- tabs:start -->

### **macOS / Linux**

Open the folder in [VS Code](https://code.visualstudio.com/):

```bash
code .
```

### **Windows (PowerShell)**

Open the folder in [VS Code](https://code.visualstudio.com/):

```powershell
code .
```

<!-- tabs:end -->

The Python extension automatically picks up the `.venv` created in step 5, giving you autocomplete and inline documentation for the NXD SDK.

### Configure the project

Create a file named `pyproject.toml` in the `nxd-tutorials` directory. `pyproject.toml` is a text file, not a command to run.

Use one of these options:

- In VS Code, Notepad, or another editor, choose **New File**, name it `pyproject.toml`, and save it in the `nxd-tutorials` directory.
- In PowerShell, run `New-Item pyproject.toml -ItemType File`, then open the file in your editor.
- In macOS or Linux shells, run `touch pyproject.toml`, then open the file in your editor.

Paste the content below into `pyproject.toml` and save the file. This file includes optional dependencies for Spark, required for the Databricks tutorial.

```toml
[project]
name = "nxd-tutorials"
version = "0.1.0"
description = "Nextdata OS onboarding tutorials"
requires-python = ">=3.11"
dependencies = [
    "nxd-core",
    "nxd-drivers",
    "nxd-data-product",
]

[[tool.uv.index]]
name = "nxd"
url = "https://nxd.partner.nextopia.dev/registry/index/"

[dependency-groups]
databricks = ["pyspark>=4.0.0"]
dev = [
    "pandas-stubs<=2.1.4",
    "pyright>=1.1.403",
    "ruff>=0.12.8",
]

[tool.ruff]
extend-exclude = ["*.pyi"]
include = ["./**/*.py"]
line-length = 120

[tool.ruff.lint]
extend-select = ["I"]

[tool.ruff.lint.isort]
force-single-line = true
```

The `[[tool.uv.index]]` block tells `uv` where to find the Nextdata OS packages. Without it, `nxd-core`, `nxd-drivers`, and `nxd-data-product` will not resolve.

## Step 5: Install dependencies

```bash
uv sync
```

Delta (Databricks) tutorial users: run `uv sync --group databricks` instead to include `pyspark`.

`uv` resolves and installs all packages from the Nextdata OS registry into a local `.venv`. VS Code will automatically detect it once you open the project folder (see step 4).

## Step 6: Verify setup

Check that the CLI can see the shared infra profile:

```bash
nxd ls infra-profiles
```

You should see `ecommerce-demo` in the list.

Check that the SDK is importable:

<!-- tabs:start -->

### **macOS / Linux**

```bash
uv run python -c 'from nxd.spec import data_product; print("SDK ready!")'
```

### **Windows (PowerShell)**

```powershell
uv run python -c "from nxd.spec import data_product; print('SDK ready!')"
```

<!-- tabs:end -->

Expected output:
```text
SDK ready!
```

---

You're ready to build your first data product.

**Next:** [Create a data product](create.md)

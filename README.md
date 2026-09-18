# Laser Characterization Tools

[![CI](https://github.com/SpikeHS/laser-characterization-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/SpikeHS/laser-characterization-tools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Interactive spectral mapping and explicit, reproducible LIV analysis for semiconductor lasers.**

These tools grew from laboratory laser research requirements and were developed
by Sen Hu with Codex assistance. The public version separates reusable software
from measurements and provides entirely synthetic examples.

[中文说明](README.zh-CN.md) · [Methods and formats](docs/methods.md) · [Roadmap](ROADMAP.md)

## Spectral mapping — no installation

Open `web/index.html` in a modern desktop browser. A **synthetic** 3 × 3
current/bias map loads automatically. Select a point to inspect its spectrum,
adjust the frequency-spacing criterion or dB thresholds, drag to zoom and
export analysis JSON. The page uses local HTML/CSS/JavaScript without a server,
external scripts or network uploads.

To analyze your spectra, choose a folder containing one device and temperature:

- UTF-8 `.txt` files with two whitespace-separated columns: wavelength **nm**,
  spectral power **dBm**. Header/comment lines are ignored.
- Default filename pattern: `sample42_I100mA_V1.5V.txt`. The sample prefix is
  informational; a folder must contain only one device/temperature.
- Legacy filenames can be selected explicitly: the first number is divided by
  10 to obtain mA, and the second by 1000 to obtain V.
- Duplicate current/bias conditions and duplicate wavelengths are rejected.

The result is a **spectral spacing screen**, not certification of stable
mode-locking. Threshold, peak grouping, resolution and noise affect the result.

## LIV analysis — Python 3.11+

```sh
git clone https://github.com/SpikeHS/laser-characterization-tools.git
cd laser-characterization-tools
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
# Linux/macOS: source .venv/bin/activate
python -m pip install -e ".[dev]"
laser-liv examples/synthetic_liv.csv --fit-min-mA 30 --fit-max-mA 80 --sample-id SYNTHETIC --out runs/demo
```

Inspect `runs/demo/analysis.json` and `liv.png`. Output directories must be new;
existing runs are never overwritten. The JSON records units, fit range, source
filename/hash, software version, warnings and per-point results.

Input CSV requires `current_mA,voltage_V,power_mW`, with strictly increasing
current and finite nonnegative measurements. The supplied curve is synthetic:
20 mA threshold, 0.4 mW/mA slope. Regenerate it with
`python examples/generate_liv.py`.

Select a physically suitable linear region with `--fit-min-mA` and
`--fit-max-mA`. The threshold is an explicitly labeled **linear extrapolation
estimate**. It replaces an earlier laboratory-script heuristic based on the
minimum WPE. The current CLI covers CW data with consistent power/current
measurement conventions; pulse/average corrections are not implemented.

## Validation

```sh
python -m pytest -q
node --test tests-js/spectrum.test.cjs
python -m build
```

Node.js 20+ is needed only for JavaScript regression tests. CI checks Windows
and Linux with Python 3.11/3.12. The browser viewer is distributed in the source
checkout/archive; the Python wheel installs the LIV command only.

## Research direction

Spectral and LIV analyses are separate modules in this release. Automated
cross-measurement linking is planned and is not implied by the repository name.
The goal is to connect device/sample records, measurement conditions and
versioned results, then support predictive-model development when suitable
data accumulates. No trained predictor or autonomous experimental loop is
included.

Related projects: [PL Analyzer](https://github.com/SpikeHS/PL-Analyzer) and
[Laser Beam QA](https://github.com/SpikeHS/laser-beam-qa).

MIT © 2026 Sen Hu. See [attribution](ATTRIBUTION.md),
[contributing](CONTRIBUTING.md) and [method details](docs/methods.md).

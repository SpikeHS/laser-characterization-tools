# Reproduce the example gallery

The README gallery illustrates the two available analysis modules using
synthetic inputs. Figures are rendered with Matplotlib and are not screenshots
of the browser viewer or the CLI's default report. They contain no laboratory
measurements. The two examples are independent; they do not represent linked
measurements of the same physical device.

## Generate the figures

From a source checkout, with Python 3.11+ and Node.js 20+:

```sh
python -m pip install -e .
python examples/generate_readme_figures.py
```

If Node.js is outside your PATH, pass `--node /path/to/node` (or the Windows
path to `node.exe`). Running the script replaces the three generated gallery
files in `docs/images`:

- [`spectral-mapping-example.png`](images/spectral-mapping-example.png)
- [`liv-analysis-example.png`](images/liv-analysis-example.png)
- [`example-results.json`](images/example-results.json): numeric results and method parameters.

The generators use the analysis code in this checkout. No network service,
instrument connection or private data file is needed. Pixel rendering can
differ with Matplotlib versions; numeric results should agree within floating
point precision.

## Spectral example

[`generate_spectral_example.cjs`](../examples/generate_spectral_example.cjs)
creates nine deterministic spectra. Seventeen Gaussian peaks are placed at
200 GHz intervals around 1300 nm, then sampled every 2 GHz. Each peak has a
frequency-domain standard deviation of 8 GHz. A synthetic amplitude envelope
and a fixed power floor determine the relative peak heights.

The current labels (60, 100, 140 mA) and bias labels (0, 1, 2 V) index different
illustrative envelope widths; they are not a calibrated model of how a device
responds to current or bias. This gallery dataset differs from the viewer's
built-in startup demo.

The script loads the actual peak-selection and spacing functions from
[`web/viewer.js`](../web/viewer.js). It uses a 6 dB counting threshold, a separate
30 dB spacing-screen depth and the strict 195–205 GHz spacing interval. All
nine synthetic conditions pass this rule. Expected counts are:

| Current (mA) | Bias 0 V | Bias 1 V | Bias 2 V |
| --- | --- | --- | --- |
| 60 | 3 | 3 | 3 |
| 100 | 3 | 5 | 5 |
| 140 | 5 | 7 | 9 |

The highlighted 140 mA / 1 V example contains seven counted peaks. A passing
spacing screen does not establish stable mode-locking; see the
[method definitions](methods.md#spectral-mapping).

## LIV example

[`synthetic_liv.csv`](../examples/synthetic_liv.csv) contains an idealized CW
curve at 5 mA steps from 0 to 100 mA:

```text
voltage_V = 1.2 + 0.003 * current_mA
power_mW = max(0, 0.4 * (current_mA - 20))
```

The gallery calls the same `analyze_liv` API as the CLI with a 30–80 mA fit
window and a zero-power baseline. Expected results are a 20 mA linear
threshold estimate, 0.4 mW/mA slope, 32 mW maximum power and about 21.33%
maximum WPE. WPE is undefined at zero electrical power and is omitted there.
These exact relationships illustrate the calculation, not achievable
measurement accuracy or device performance.

To produce the CLI's standard report from the same input, use a new output
directory:

```sh
laser-liv examples/synthetic_liv.csv --fit-min-mA 30 --fit-max-mA 80 --sample-id SYNTHETIC --out runs/gallery-demo
```

The CLI also records source-file provenance and per-point values in
`analysis.json`. Its default plot layout differs from the README gallery.

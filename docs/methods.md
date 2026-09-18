# Methods and input contracts

## Spectral mapping

The importer uses two whitespace-separated columns: wavelength_nm and
power_dBm. Wavelengths are sorted and must be positive and unique. Numeric
rows with nonfinite values are not used; files with fewer than three usable
points or unmatched condition names are counted as skipped. Load only one
device and temperature per folder; repeated current/bias conditions are errors.

Local maxima are screened relative to the largest peak. Frequency spacing is
`299792458 * abs(1/lambda1_nm - 1/lambda2_nm)` in GHz. Nearby peaks use the
existing 20 GHz grouping rule. A separate screening depth (default 30 dB below
the maximum) selects the peaks used for the spacing criterion. Every adjacent
screening-peak spacing must be strictly inside the selected interval. Reported
3 dB/6 dB/custom counts then use the associated relative amplitude threshold.

These are transparent screening rules inherited from the laboratory viewer;
they are not a universal model of laser operation. Inspect spectra and adjust
criteria for your instrument resolution, noise and research question. The
public JSON field is `spacing_rule_passed`, replacing the stronger legacy
name `stable_mode_locked`.

Data files are read with the browser File API. No remote processing, analytics
or upload endpoint is included. The startup demo is generated analytically in
JavaScript. Exported JSON contains filenames and derived measurements, so
review it before sharing your own results.

## LIV

Inputs: current_mA, voltage_V, power_mW. Current must be strictly increasing;
positive current requires positive voltage. Invalid/negative measurements are
rejected rather than silently removed. Zero electrical power produces null WPE.

Electrical power in mW = current_mA × voltage_V.
WPE in percent = 100 × power_mW / electrical_power_mW.

Fit `power_mW = slope * current_mA + intercept` over an explicitly selected
interval containing at least three points. A nonpositive slope is rejected.
Threshold estimate = `(baseline_mW - intercept) / slope`. The default baseline
is zero and can be supplied explicitly. R², the fit window and fit-point count
are included. Estimates outside the measurement range, low R² and WPE above
100% produce warnings; the software does not automatically choose a physical
threshold or remove rollover regions.

The CLI currently assumes CW measurements with compatible input/output power
conventions. It does not infer pulse duty cycle, optical collection efficiency,
detector calibration or uncertainty. Synthetic regression tests validate
numerical behavior, not performance on every material or device.

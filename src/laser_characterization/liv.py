"""LIV analysis with explicit units and an explicitly chosen linear-fit window."""
from __future__ import annotations

import csv
from pathlib import Path

import numpy as np


def read_liv_csv(path: str | Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Read current_mA, voltage_V, power_mW columns; reject malformed rows."""
    columns = ("current_mA", "voltage_V", "power_mW")
    rows = []
    with Path(path).open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not set(columns).issubset(reader.fieldnames or []):
            raise ValueError(f"CSV requires columns: {', '.join(columns)}")
        for line_number, row in enumerate(reader, start=2):
            try:
                rows.append([float(row[key]) for key in columns])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Invalid numeric row at line {line_number}") from exc
    if not rows:
        raise ValueError("CSV contains no measurements")
    return tuple(np.asarray(rows, dtype=float).T)


def analyze_liv(current_mA, voltage_V, power_mW, *, fit_range_mA, baseline_mW=0.0):
    """Return JSON-safe metrics and per-point WPE for a single CW condition.

    Fit P = slope*I + intercept in the caller-selected interval. The reported
    threshold is its intersection with baseline_mW, not an automatic physical
    threshold determination. Inputs are never smoothed or silently discarded.
    """
    current, voltage, power = [np.asarray(value, dtype=float) for value in
                               (current_mA, voltage_V, power_mW)]
    if any(value.ndim != 1 for value in (current, voltage, power)):
        raise ValueError("Inputs must be one-dimensional arrays")
    if len(current) < 3 or not (len(current) == len(voltage) == len(power)):
        raise ValueError("At least three aligned measurements are required")
    if not all(np.isfinite(value).all() for value in (current, voltage, power)):
        raise ValueError("All measurements must be finite")
    if (current < 0).any() or (voltage < 0).any() or (power < 0).any():
        raise ValueError("Current, voltage and power must be nonnegative")
    if ((current > 0) & (voltage <= 0)).any():
        raise ValueError("Voltage must be positive at nonzero current")
    if (np.diff(current) <= 0).any():
        raise ValueError("Current must be strictly increasing with no duplicates")
    if len(fit_range_mA) != 2:
        raise ValueError("fit_range_mA must contain lower and upper bounds")
    lower, upper = map(float, fit_range_mA)
    if not np.isfinite([lower, upper, baseline_mW]).all() or lower >= upper:
        raise ValueError("Fit bounds and baseline must be finite; lower < upper")
    selected = (current >= lower) & (current <= upper)
    if np.count_nonzero(selected) < 3:
        raise ValueError("The fit interval must contain at least three points")
    slope, intercept = np.polyfit(current[selected], power[selected], 1)
    if slope <= 0:
        raise ValueError("The selected interval has no positive slope")
    predicted = slope * current[selected] + intercept
    residual = power[selected] - predicted
    total = float(np.sum((power[selected] - power[selected].mean()) ** 2))
    r_squared = None if total == 0 else float(1 - np.sum(residual ** 2) / total)
    threshold = float((baseline_mW - intercept) / slope)
    electrical_mW = current * voltage
    wpe = np.divide(100 * power, electrical_mW, out=np.full_like(power, np.nan),
                    where=electrical_mW > 0)
    warnings = []
    if threshold < 0 or threshold > float(current[-1]):
        warnings.append("Extrapolated threshold lies outside the measured current range")
    if r_squared is not None and r_squared < 0.98:
        warnings.append("The selected fit interval deviates from a linear response")
    if np.nanmax(wpe) > 100:
        warnings.append("WPE exceeds 100%; check units and measurement calibration")
    return {
        "schema_version": "0.1.0", "method": "explicit-window-linear-extrapolation",
        "measurement_mode": "CW", "fit_range_mA": [lower, upper],
        "fit_point_count": int(selected.sum()), "baseline_mW": float(baseline_mW),
        "threshold_estimate_mA": threshold, "slope_efficiency_mW_per_mA": float(slope),
        "fit_intercept_mW": float(intercept), "fit_r_squared": r_squared,
        "max_power_mW": float(power.max()), "max_wpe_percent": float(np.nanmax(wpe)),
        "warnings": warnings,
        "points": [{"current_mA": float(i), "voltage_V": float(v),
                    "power_mW": float(p), "wpe_percent": None if not np.isfinite(w) else float(w)}
                   for i, v, p, w in zip(current, voltage, power, wpe)],
    }

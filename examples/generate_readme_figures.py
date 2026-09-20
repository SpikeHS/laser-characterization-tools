"""Rebuild the README gallery from synthetic inputs and production analysis code."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
# Always use this checkout's implementation, not another installed version.
sys.path.insert(0, str(ROOT / "src"))
from laser_characterization.liv import analyze_liv, read_liv_csv

BLUE = "#235a91"
TEAL = "#008579"
ORANGE = "#c66b1b"
INK = "#172e43"


def style_axes(ax):
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(alpha=0.16)
    ax.set_axisbelow(True)


def spectral_figure(data, output):
    fig, (map_ax, spectrum_ax) = plt.subplots(
        1, 2, figsize=(12, 5.5), gridspec_kw={"width_ratios": [1, 1.65]}
    )
    fig.subplots_adjust(left=0.07, right=0.975, top=0.75, bottom=0.19, wspace=0.4)
    fig.text(0.07, 0.93, "Spectral mapping & peak analysis", fontsize=21, weight="bold")
    fig.text(0.07, 0.865, "SYNTHETIC DATA  |  200 GHz spacing  |  6 dB peak-count threshold",
             fontsize=11, color=BLUE)

    counts = np.array([cell["comb_line_count"] for cell in data["cells"]]).reshape(3, 3)
    im = map_ax.imshow(counts, origin="lower", cmap="viridis", vmin=0, vmax=9, aspect="auto")
    map_ax.set_xticks(range(3), data["biases_V"])
    map_ax.set_yticks(range(3), data["currents_mA"])
    map_ax.set(xlabel="Bias (V)", ylabel="Current (mA)", title="A   Peaks within 6 dB of maximum")
    for row in range(3):
        for col in range(3):
            map_ax.text(col, row, str(counts[row, col]), ha="center", va="center",
                        fontsize=21, weight="bold", color="white" if counts[row, col] < 5 else INK)
    map_ax.add_patch(Rectangle((0.5, 1.5), 1, 1, fill=False, edgecolor=ORANGE, linewidth=3))
    fig.colorbar(im, ax=map_ax, fraction=0.045, pad=0.04, ticks=[0, 3, 6, 9], label="Peak count")

    selected = data["selected"]
    analysis = selected["analysis"]
    spectrum_ax.plot(selected["wavelength_nm"], selected["power_dBm"], color=BLUE,
                     linewidth=1.2, label="Synthetic spectrum")
    peaks = analysis["selected_peaks"]
    spectrum_ax.scatter([p["wavelength_nm"] for p in peaks], [p["power_dBm"] for p in peaks],
                        color=ORANGE, s=28, zorder=3, label=f"Counted peaks ({len(peaks)})")
    spectrum_ax.axhline(analysis["threshold_dBm"], color=ORANGE, linestyle="--", linewidth=1,
                       label="6 dB count threshold")
    spectrum_ax.axhline(analysis["stability_threshold_dBm"], color=TEAL, linestyle=":",
                       linewidth=1.3, label="30 dB spacing-screen depth")
    spectrum_ax.set(xlabel="Wavelength (nm)", ylabel="Spectral power (dBm)", ylim=(-72, 2),
                    xlim=(min(selected["wavelength_nm"]), max(selected["wavelength_nm"])),
                    title=f"B   Selected point: {selected['current_mA']} mA, {selected['bias_V']} V")
    spectrum_ax.legend(loc="lower center", fontsize=8, ncol=2, framealpha=0.96)
    style_axes(spectrum_ax)
    fig.text(0.07, 0.065, "All 9 synthetic conditions pass the 195–205 GHz spacing rule. "
             "This is a spectral screen, not a mode-locking diagnosis.", fontsize=9, color="#526577")
    fig.savefig(output, dpi=170, facecolor="white")
    plt.close(fig)


def liv_figure(current, voltage, power, result, output):
    fig, axes = plt.subplots(2, 2, figsize=(12, 7.8))
    fig.subplots_adjust(left=0.08, right=0.96, top=0.79, bottom=0.12, hspace=0.58, wspace=0.28)
    fig.text(0.08, 0.94, "LIV analysis with explicit fit bounds", fontsize=21, weight="bold")
    fig.text(0.08, 0.885, "SYNTHETIC DATA  |  CW example  |  Fit interval: 30–80 mA",
             fontsize=11, color=BLUE)
    li, vi, wpe, summary = axes.flat
    li.plot(current, power, "o-", color=BLUE, markersize=3.5, label="Synthetic input")
    fit_current = np.array([result["threshold_estimate_mA"], result["fit_range_mA"][1]])
    li.plot(fit_current, result["slope_efficiency_mW_per_mA"] * fit_current
            + result["fit_intercept_mW"], "--", color=ORANGE, label="Linear fit / extrapolation")
    li.axvspan(*result["fit_range_mA"], color=TEAL, alpha=0.08, label="Selected fit interval")
    li.set(ylabel="Optical power (mW)", title="A   Light–current response")
    li.legend(fontsize=8, loc="upper left")
    vi.plot(current, voltage, "o-", color=BLUE, markersize=3.5)
    vi.set(ylabel="Voltage (V)", title="B   Voltage–current response")
    wpe.plot(current, [p["wpe_percent"] for p in result["points"]], "o-", color=TEAL, markersize=3.5)
    wpe.set(ylabel="Wall-plug efficiency (%)", title="C   Optical / electrical power")
    for ax in (li, vi, wpe):
        ax.set_xlabel("Current (mA)")
        ax.set_xlim(0, 100)
        style_axes(ax)

    summary.axis("off")
    summary.set_title("D   Results from the production analysis API", loc="left")
    metrics = [
        ("Linear threshold estimate", f"{result['threshold_estimate_mA']:.1f} mA"),
        ("Slope efficiency", f"{result['slope_efficiency_mW_per_mA']:.2f} mW/mA"),
        ("Maximum optical power", f"{result['max_power_mW']:.1f} mW"),
        ("Maximum WPE", f"{result['max_wpe_percent']:.2f}%"),
    ]
    for y, (label, value) in zip([0.81, 0.59, 0.37, 0.15], metrics):
        summary.text(0.01, y, label, fontsize=11, transform=summary.transAxes)
        summary.text(0.97, y, value, fontsize=13, weight="bold", color=BLUE,
                     ha="right", transform=summary.transAxes)
    fig.text(0.08, 0.04, "Illustrative inputs with a known 20 mA threshold and 0.4 mW/mA slope. "
             "Zero-current WPE is undefined and omitted.", fontsize=9, color="#526577")
    fig.savefig(output, dpi=170, facecolor="white")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default="node", help="Node.js executable (20+)")
    args = parser.parse_args()
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10,
                         "text.color": INK, "axes.labelcolor": INK, "axes.titlepad": 12,
                         "xtick.color": INK, "ytick.color": INK})
    completed = subprocess.run([args.node, str(ROOT / "examples/generate_spectral_example.cjs")],
                               check=True, capture_output=True, text=True, encoding="utf-8")
    spectral = json.loads(completed.stdout)
    if not all(cell["spacing_rule_passed"] for cell in spectral["cells"]):
        raise ValueError("Synthetic spacing example no longer passes; review before publishing")
    current, voltage, power = read_liv_csv(ROOT / "examples/synthetic_liv.csv")
    liv = analyze_liv(current, voltage, power, fit_range_mA=(30, 80))
    output = ROOT / "docs/images"
    output.mkdir(parents=True, exist_ok=True)
    spectral_figure(spectral, output / "spectral-mapping-example.png")
    liv_figure(current, voltage, power, liv, output / "liv-analysis-example.png")
    summary = {"synthetic": True,
               "spectral": {key: spectral[key] for key in ("spacing_interval_GHz", "count_drop_dB",
                            "screening_drop_dB", "cells")},
               "liv": {key: value for key, value in liv.items() if key != "points"}}
    (output / "example-results.json").write_text(
        json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    print("Generated docs/images/{spectral-mapping-example.png,liv-analysis-example.png,example-results.json}")


if __name__ == "__main__":
    main()

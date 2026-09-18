"""Command-line LIV analysis; outputs never overwrite an existing run."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from .liv import analyze_liv, read_liv_csv


def main(argv=None):
    parser = argparse.ArgumentParser(description="Analyze one CW LIV CSV with explicit fit bounds.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--fit-min-mA", required=True, type=float, dest="fit_min")
    parser.add_argument("--fit-max-mA", required=True, type=float, dest="fit_max")
    parser.add_argument("--baseline-mW", type=float, default=0, dest="baseline")
    parser.add_argument("--sample-id", required=True)
    parser.add_argument("--temperature-C", type=float, dest="temperature")
    parser.add_argument("--out", type=Path, required=True, help="New output directory")
    args = parser.parse_args(argv)
    try:
        if args.out.exists():
            raise ValueError("Output directory already exists; select a new run directory")
        current, voltage, power = read_liv_csv(args.input)
        result = analyze_liv(current, voltage, power,
                             fit_range_mA=(args.fit_min, args.fit_max), baseline_mW=args.baseline)
        result.update({"sample_id": args.sample_id, "temperature_C": args.temperature,
                       "source_file": args.input.name,
                       "source_sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
                       "software_version": "0.1.0"})
        serialized = json.dumps(result, indent=2, allow_nan=False)
        args.out.mkdir(parents=True, exist_ok=False)
        (args.out / "analysis.json").write_text(serialized + "\n", encoding="utf-8")
        from matplotlib.figure import Figure
        fig = Figure(figsize=(10, 7), constrained_layout=True)
        axes = fig.subplots(2, 2)
        axes[0, 0].plot(current, power, label="Measured")
        selected = (current >= args.fit_min) & (current <= args.fit_max)
        axes[0, 0].plot(current[selected], result["slope_efficiency_mW_per_mA"] * current[selected]
                        + result["fit_intercept_mW"], "--", label="Selected fit")
        axes[0, 0].set_ylabel("Optical power (mW)")
        axes[0, 0].legend()
        axes[0, 1].plot(current, voltage)
        axes[0, 1].set_ylabel("Voltage (V)")
        axes[1, 0].plot(current, [point["wpe_percent"] for point in result["points"]])
        axes[1, 0].set_ylabel("WPE (%)")
        axes[1, 1].axis("off")
        axes[1, 1].text(0, 1, f"{args.sample_id}\nCW analysis\nLinear threshold estimate: "
                       f"{result['threshold_estimate_mA']:.3g} mA\nSlope: "
                       f"{result['slope_efficiency_mW_per_mA']:.3g} mW/mA\n"
                       f"Fit interval: {args.fit_min:g}–{args.fit_max:g} mA\n"
                       "Inspect analysis.json for parameters and warnings.", va="top", wrap=True)
        for ax in (axes[0, 0], axes[0, 1], axes[1, 0]):
            ax.set_xlabel("Current (mA)")
            ax.grid(alpha=0.2)
        fig.savefig(args.out / "liv.png", dpi=140)
        print(f"Wrote {args.out / 'analysis.json'} and liv.png")
        return 0
    except (ValueError, OSError) as exc:
        parser.exit(2, f"error: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())

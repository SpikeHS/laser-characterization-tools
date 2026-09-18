import json

import numpy as np
import pytest

from laser_characterization import analyze_liv, read_liv_csv
from laser_characterization.cli import main


def data():
    current = np.arange(0, 101, 10, dtype=float)
    return current, 1.2 + 0.003 * current, np.maximum(0, 0.4 * (current - 20))


def test_known_synthetic_threshold_slope_and_units():
    result = analyze_liv(*data(), fit_range_mA=(30, 80))
    assert result["threshold_estimate_mA"] == pytest.approx(20)
    assert result["slope_efficiency_mW_per_mA"] == pytest.approx(0.4)
    assert result["fit_r_squared"] == pytest.approx(1)
    assert result["points"][0]["wpe_percent"] is None
    assert result["points"][-1]["wpe_percent"] == pytest.approx(100 * 32 / 150)
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize("bad", [np.nan, np.inf, -1])
def test_rejects_invalid_measurements(bad):
    i, v, p = data()
    p[3] = bad
    with pytest.raises(ValueError):
        analyze_liv(i, v, p, fit_range_mA=(30, 80))


def test_rejects_duplicate_current_and_inadequate_interval():
    i, v, p = data()
    with pytest.raises(ValueError, match="three points"):
        analyze_liv(i, v, p, fit_range_mA=(30, 40))
    i[3] = i[2]
    with pytest.raises(ValueError, match="strictly increasing"):
        analyze_liv(i, v, p, fit_range_mA=(30, 80))


def test_different_baseline_is_explicit():
    result = analyze_liv(*data(), fit_range_mA=(30, 80), baseline_mW=2)
    assert result["threshold_estimate_mA"] == pytest.approx(25)


def test_cli_preserves_input_and_refuses_overwrite(tmp_path):
    path = tmp_path / "input.csv"
    path.write_text("current_mA,voltage_V,power_mW\n" + "\n".join(
        f"{i},{v},{p}" for i, v, p in zip(*data())), encoding="utf-8")
    original = path.read_bytes()
    out = tmp_path / "run"
    args = [str(path), "--fit-min-mA", "30", "--fit-max-mA", "80",
            "--sample-id", "SYNTHETIC", "--out", str(out)]
    assert main(args) == 0
    assert (out / "liv.png").stat().st_size > 1000
    result = json.loads((out / "analysis.json").read_text())
    assert result["source_file"] == "input.csv"
    assert len(result["source_sha256"]) == 64
    assert result["threshold_estimate_mA"] == pytest.approx(20)
    with pytest.raises(SystemExit) as exc:
        main(args)
    assert exc.value.code == 2
    assert path.read_bytes() == original


def test_csv_requires_explicit_units(tmp_path):
    path = tmp_path / "bad.csv"
    path.write_text("current,voltage,power\n10,2,1\n")
    with pytest.raises(ValueError, match="current_mA"):
        read_liv_csv(path)


def test_fit_rejects_rollover_only_region():
    i, v, p = data()
    with pytest.raises(ValueError, match="positive slope"):
        analyze_liv(i, v, 40 - p, fit_range_mA=(30, 80))

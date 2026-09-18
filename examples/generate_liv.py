"""Generate an entirely synthetic CW curve with a 20 mA threshold and 0.4 W/A slope."""
from pathlib import Path

target = Path(__file__).with_name("synthetic_liv.csv")
rows = ["current_mA,voltage_V,power_mW"]
for current in range(0, 101, 5):
    rows.append(f"{current},{1.2 + 0.003 * current:.6f},{max(0, 0.4 * (current - 20)):.6f}")
target.write_text("\n".join(rows) + "\n", encoding="utf-8")
print(target.name)

// Deterministic synthetic spectra analyzed by the actual browser-viewer functions.
// Emits JSON to stdout for generate_readme_figures.py; no laboratory files are read.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../web/viewer.js'), 'utf8');
const starts = [...source.matchAll(/^    (?:async )?function (\w+)\(/gm)];
const names = new Set(['thresholdKey', 'spacingTarget', 'spacingTolerance', 'spacingPass',
  'findLocalPeaks', 'spacingGhz', 'mergeNearbyPeaks', 'dedupeNearbyPeaks',
  'envelopeCenter', 'selectedPeakIndicesForDrop', 'stabilityPeakIndicesForDrop',
  'spacingsForPeakIndices', 'analyzeThreshold']);
const functions = starts.filter(match => names.has(match[1])).map(match => {
  const index = starts.indexOf(match);
  return source.slice(match.index, starts[index + 1]?.index ?? source.length);
}).join('\n');
if (starts.filter(match => names.has(match[1])).length !== names.size) {
  throw new Error('Viewer functions changed; review the example generator.');
}
const ctx = vm.createContext({});
vm.runInContext('let DATA = {spacingMinGHz:195, spacingMaxGHz:205, stabilityDropDb:30};\n'
  + functions, ctx);

const currents = [60, 100, 140];
const biases = [0, 1, 2];
const cells = [];
let selected;
for (let row = 0; row < currents.length; row++) {
  for (let col = 0; col < biases.length; col++) {
    // Labels index illustrative envelope widths; this is not a device physics model.
    const curvature = [2.4, 1.1, 0.55][row] * [1.5, 1, 0.65][col];
    const wavelengths = [];
    const powers = [];
    const centerTHz = 299792.458 / 1300;
    for (let step = 0; step <= 1800; step++) {
      const offsetTHz = 1.8 - step * 0.002;
      let powerMW = 1e-9;
      for (let mode = -8; mode <= 8; mode++) {
        const peakDbm = -12 - curvature * mode ** 2;
        powerMW += 10 ** (peakDbm / 10)
          * Math.exp(-0.5 * ((offsetTHz - mode * 0.2) / 0.008) ** 2);
      }
      wavelengths.push(299792.458 / (centerTHz + offsetTHz));
      powers.push(10 * Math.log10(powerMW));
    }
    const analysis = ctx.analyzeThreshold(wavelengths, powers, 6);
    const cell = {current_mA: currents[row], bias_V: biases[col],
      spacing_rule_passed: analysis.spacing_rule_passed,
      comb_line_count: analysis.comb_line_count};
    cells.push(cell);
    if (row === 2 && col === 1) {
      selected = {...cell, wavelength_nm: wavelengths, power_dBm: powers, analysis};
    }
  }
}
process.stdout.write(JSON.stringify({synthetic: true, currents_mA: currents, biases_V: biases,
  spacing_interval_GHz: [195, 205], count_drop_dB: 6, screening_drop_dB: 30,
  cells, selected}));

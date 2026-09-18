const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the actual viewer functions without a browser or laboratory files.
const source = fs.readFileSync(path.join(__dirname, '../web/viewer.js'), 'utf8');
const starts = [...source.matchAll(/^    (?:async )?function (\w+)\(/gm)];
const names = new Set(['thresholdKey', 'spacingTarget', 'spacingTolerance', 'spacingPass',
  'parseCurrentAndBias', 'parseSpectrumText', 'findLocalPeaks', 'spacingGhz',
  'mergeNearbyPeaks', 'dedupeNearbyPeaks', 'envelopeCenter', 'selectedPeakIndicesForDrop',
  'stabilityPeakIndicesForDrop', 'spacingsForPeakIndices', 'analyzeThreshold']);
const functions = starts.filter(match => names.has(match[1])).map(match => {
  const index = starts.indexOf(match);
  return source.slice(match.index, starts[index + 1].index);
}).join('\n');

function context(format = 'explicit') {
  const ctx = vm.createContext({document: {getElementById: () => ({value: format})}});
  vm.runInContext('let DATA = {spacingMinGHz:195, spacingMaxGHz:205, stabilityDropDb:30};\n' + functions, ctx);
  return ctx;
}

test('explicit units do not interpret sample numbers as current', () => {
  const ctx = context();
  assert.equal(ctx.parseCurrentAndBias('sample42_I100mA_V1.5V.txt').current, 100);
  assert.equal(ctx.parseCurrentAndBias('sample42_I100mA_V1.5V.txt').bias, 1.5);
  assert.equal(ctx.parseCurrentAndBias('ambiguous_100_1500.txt').current, null);
});

test('legacy conversion requires the explicit option', () => {
  const ctx = context('legacy');
  assert.equal(ctx.parseCurrentAndBias('data1000_1500.txt').current, 100);
  assert.equal(ctx.parseCurrentAndBias('data1000_1500.txt').bias, 1.5);
});

test('numeric spectra are sorted, with headers skipped and duplicates rejected', () => {
  const ctx = context();
  const result = ctx.parseSpectrumText('# nm dBm\n1301 -30\n1300 -20\n\n');
  assert.deepEqual(Array.from(result.wavelengths), [1300, 1301]);
  assert.deepEqual(Array.from(result.powers), [-20, -30]);
  assert.throws(() => ctx.parseSpectrumText('1300 -20\n1300 -30'), /unique/);
  assert.throws(() => ctx.parseSpectrumText('0 -20\n1300 -30'), /positive/);
});

test('wavelength-to-frequency spacing has GHz units', () => {
  const ctx = context();
  const first = 299792.458 / 230;
  const second = 299792.458 / 229.8;
  assert.ok(Math.abs(ctx.spacingGhz(first, second) - 200) < 1e-8);
});

test('synthetic equal-frequency peaks pass only the matching spacing rule', () => {
  const ctx = context();
  const wavelengths = [];
  const powers = [];
  for (const frequency of [230.2, 230, 229.8]) {
    const peak = 299792.458 / frequency;
    wavelengths.push(peak - 0.01, peak, peak + 0.01);
    powers.push(-80, -10, -80);
  }
  const result = ctx.analyzeThreshold(wavelengths, powers, 6);
  assert.equal(result.spacing_rule_passed, true);
  assert.equal(result.comb_line_count, 3);
  vm.runInContext('DATA.spacingMinGHz = 95; DATA.spacingMaxGHz = 105;', ctx);
  assert.equal(ctx.analyzeThreshold(wavelengths, powers, 6).spacing_rule_passed, false);
});

test('a single peak cannot establish spacing', () => {
  const result = context().analyzeThreshold([1299, 1300, 1301], [-80, -10, -80], 6);
  assert.equal(result.spacing_rule_passed, false);
  assert.equal(result.comb_line_count, 0);
});

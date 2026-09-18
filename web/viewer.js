    let DATA = {threshold: 6, thresholds: [3, 6], spacingMinGHz: 195, spacingMaxGHz: 205, spacingTargetGHz: 200, spacingToleranceGHz: 5, stabilityDropDb: 30, points: [], spectra: {}, rawSpectra: {}, currents: [], biases: [], maxCounts: {"3": 0, "6": 0}};
    const mappingSvg = document.getElementById("mappingSvg");
    const mappingStatus = document.getElementById("mappingStatus");
    const criterionStatus = document.getElementById("criterionStatus");
    const pageTitle = document.getElementById("pageTitle");
    const spacingTargetInput = document.getElementById("spacingTargetInput");
    const spacingToleranceInput = document.getElementById("spacingToleranceInput");
    const stabilityThresholdInput = document.getElementById("stabilityThresholdInput");
    const applySpacingButton = document.getElementById("applySpacingButton");
    const customThresholdInput = document.getElementById("customThresholdInput");
    const applyThresholdButton = document.getElementById("applyThresholdButton");
    const folderPicker = document.getElementById("folderPicker");
    const folderStatus = document.getElementById("folderStatus");
    const pointDetails = document.getElementById("pointDetails");
    const spectrumTitle = document.getElementById("spectrumTitle");
    const spectrumCanvas = document.getElementById("spectrumCanvas");
    const resetSpectrumZoomButton = document.getElementById("resetSpectrumZoomButton");
    const spectrumAnalysisDetails = document.getElementById("spectrumAnalysisDetails");
    const spectrumCtx = spectrumCanvas.getContext("2d");
    const fixedThresholds = [3, 6];
    let activeThreshold = DATA.threshold;
    let selectedPoint = null;
    let spectrumZoom = null;
    let spectrumDrag = null;
    let lastSpectrumPlot = null;

    const palette = [
      [0.00, [49, 54, 149]],
      [0.25, [69, 117, 180]],
      [0.50, [116, 173, 209]],
      [0.72, [171, 221, 164]],
      [0.88, [253, 174, 97]],
      [1.00, [215, 48, 39]]
    ];

    function thresholdKey(drop) { return String(drop).replace(".", "p"); }
    function trimNumber(value, digits = 6) { return String(Number(Number(value).toFixed(digits))); }
    function formatNumber(value, digits = 3) {
      if (value == null || Number.isNaN(value)) return "N/A";
      return Number(value).toFixed(digits);
    }
    function svgEl(tag, attrs = {}) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
      return el;
    }
    function lerp(left, right, t) { return left + (right - left) * t; }
    function colorToString(color) { return `rgb(${color[0]},${color[1]},${color[2]})`; }
    function colorForValue(value, maximum) {
      if (value == null) return [255, 255, 255];
      if (value <= 0 || maximum <= 0) return [238, 238, 238];
      const t = value / maximum;
      for (let idx = 0; idx < palette.length - 1; idx += 1) {
        const [lt, lc] = palette[idx];
        const [rt, rc] = palette[idx + 1];
        if (lt <= t && t <= rt) {
          const local = (t - lt) / (rt - lt);
          return lc.map((channel, channelIdx) => Math.round(lerp(channel, rc[channelIdx], local)));
        }
      }
      return palette[palette.length - 1][1];
    }
    function textColorForBackground(color) {
      const luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
      return luminance < 125 ? "#fff" : "#1f2933";
    }
    function spacingTarget() { return (Number(DATA.spacingMinGHz) + Number(DATA.spacingMaxGHz)) / 2; }
    function spacingTolerance() { return (Number(DATA.spacingMaxGHz) - Number(DATA.spacingMinGHz)) / 2; }
    function spacingPass(value) { return DATA.spacingMinGHz < value && value < DATA.spacingMaxGHz; }
    function criterionText() {
      return `${trimNumber(DATA.spacingMinGHz, 3)}-${trimNumber(DATA.spacingMaxGHz, 3)} GHz (center ${trimNumber(spacingTarget(), 3)} +/- ${trimNumber(spacingTolerance(), 3)} GHz), screening ${trimNumber(DATA.stabilityDropDb ?? 30)} dB`;
    }
    function updatePageTitle() {
      pageTitle.textContent = "Optical Spectrum Comb Number Mapping";
    }
    function updateCriterionStatus() {
      criterionStatus.textContent = `Spacing criterion = ${criterionText()}`;
    }
    function setSpacingInputsFromData() {
      spacingTargetInput.value = trimNumber(DATA.spacingTargetGHz ?? spacingTarget(), 3);
      spacingToleranceInput.value = trimNumber(DATA.spacingToleranceGHz ?? spacingTolerance(), 3);
      stabilityThresholdInput.value = trimNumber(DATA.stabilityDropDb ?? 30, 3);
    }
    function sameThreshold(left, right) {
      return Math.abs(Number(left) - Number(right)) < 1e-9;
    }
    function hasFixedThreshold(drop) {
      return fixedThresholds.some(value => sameThreshold(value, drop));
    }
    function setVisibleThresholds(customDrop = DATA.customThreshold) {
      const thresholds = [...fixedThresholds];
      if (Number.isFinite(Number(customDrop)) && !hasFixedThreshold(customDrop)) thresholds.push(Number(customDrop));
      DATA.thresholds = thresholds;
    }
    function setThresholdButtonStates() {
      for (const button of document.querySelectorAll(".threshold-button")) {
        button.classList.toggle("active", sameThreshold(Number(button.dataset.threshold), activeThreshold));
      }
      applyThresholdButton.classList.toggle("active", !hasFixedThreshold(activeThreshold));
    }
    function thresholdColor(key) {
      const colors = { "3": "#e88c23", "6": "#c8462d" };
      return colors[key] || "#147d64";
    }
    function recomputeAnalysisForSpacing(analysis) {
      if (!analysis) return;
      delete analysis.instability_reason;
      const stabilitySpacings = analysis.stability_spacings_GHz || analysis.spacings_GHz || [];
      const stable = stabilitySpacings.length > 0 && stabilitySpacings.every(spacingPass);
      analysis.spacing_rule_passed = stable;
      analysis.comb_line_count = stable ? analysis.selected_peaks.length : 0;
    }
    function recomputeMaxCounts() {
      const maxCounts = {};
      for (const drop of DATA.thresholds) {
        const key = thresholdKey(drop);
        maxCounts[key] = Math.max(0, ...DATA.points.map(point => point.analyses[key]?.comb_line_count || 0));
      }
      DATA.maxCounts = maxCounts;
    }
    function recomputeCombCountsFromSpacing() {
      for (const point of DATA.points) {
        const raw = rawSpectrumForPoint(point);
        for (const drop of DATA.thresholds) {
          const key = thresholdKey(drop);
          if (raw?.wavelengths?.length) {
            point.analyses[key] = analyzeThreshold(raw.wavelengths, raw.powers, drop);
          } else {
            recomputeAnalysisForSpacing(point.analyses[key]);
          }
        }
      }
      recomputeMaxCounts();
    }
    function rawSpectrumForPoint(point) {
      return DATA.rawSpectra?.[point.id] || null;
    }
    function ensureThresholdAnalysis(drop) {
      const key = thresholdKey(drop);
      for (const point of DATA.points) {
        if (point.analyses[key]) continue;
        const raw = rawSpectrumForPoint(point);
        if (!raw || !raw.wavelengths?.length) {
          throw new Error("Full spectrum data is unavailable for custom dB analysis.");
        }
        point.analyses[key] = analyzeThreshold(raw.wavelengths, raw.powers, drop);
      }
    }
    function applyCustomThreshold() {
      const drop = Number(customThresholdInput.value);
      if (!Number.isFinite(drop) || drop <= 0) {
        mappingStatus.textContent = "Invalid custom dB criterion";
        return;
      }
      DATA.customThreshold = drop;
      setVisibleThresholds(drop);
      try {
        ensureThresholdAnalysis(drop);
      } catch (error) {
        mappingStatus.textContent = error.message;
        return;
      }
      recomputeCombCountsFromSpacing();
      activeThreshold = drop;
      setThresholdButtonStates();
      updatePageTitle();
      clearSpectrumZoom();
      selectedPoint = bestPoint();
      renderMapping();
      updateDetails();
      drawSpectrum();
    }
    function applySpacingInputs() {
      const target = Number(spacingTargetInput.value);
      const tolerance = Number(spacingToleranceInput.value);
      const stabilityDrop = Number(stabilityThresholdInput.value);
      if (!Number.isFinite(target) || !Number.isFinite(tolerance) || !Number.isFinite(stabilityDrop) || target <= 0 || tolerance <= 0 || stabilityDrop <= 0 || target - tolerance <= 0) {
        criterionStatus.textContent = "Invalid spacing or stability criterion";
        return;
      }
      DATA.spacingTargetGHz = target;
      DATA.spacingToleranceGHz = tolerance;
      DATA.spacingMinGHz = target - tolerance;
      DATA.spacingMaxGHz = target + tolerance;
      DATA.stabilityDropDb = stabilityDrop;
      recomputeCombCountsFromSpacing();
      clearSpectrumZoom();
      selectedPoint = selectedPoint ? DATA.points.find(point => point.id === selectedPoint.id) || bestPoint() : bestPoint();
      renderMapping();
      updateDetails();
      drawSpectrum();
    }

    function parseCurrentAndBias(filename) {
      const mode = document.getElementById("filenameFormat").value;
      if (mode === "explicit") {
        const match = filename.match(/(?:^|_)I(-?\d+(?:\.\d+)?)mA_V(-?\d+(?:\.\d+)?)V(?:_|\.)/i);
        return {current: match ? Number(match[1]) : null, bias: match ? Number(match[2]) : null};
      }
      // Legacy acquisition names encode 0.1 mA and mV; explicitly opt in.
      const numbers = filename.match(/[-+]?\d+(?:\.\d+)?/g)?.map(Number) || [];
      return {current: numbers.length >= 1 ? numbers[0] / 10 : null,
              bias: numbers.length >= 2 ? numbers[1] / 1000 : null};
    }
    function parseSpectrumText(text) {
      const wavelengths = [];
      const powers = [];
      for (const line of text.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        if (!parts[0] || parts[0].startsWith("#")) continue;
        const wavelength = Number(parts[0]);
        const power = Number(parts[1]);
        if (Number.isFinite(wavelength) && Number.isFinite(power)) {
          wavelengths.push(wavelength);
          powers.push(power);
        }
      }
      const pairs = wavelengths.map((wavelength, index) => [wavelength, powers[index]])
        .sort((left, right) => left[0] - right[0]);
      if (pairs.some((pair, index) => pair[0] <= 0 || (index > 0 && pair[0] === pairs[index - 1][0]))) {
        throw new Error("Wavelengths must be positive and unique (nm).");
      }
      return {wavelengths: pairs.map(pair => pair[0]), powers: pairs.map(pair => pair[1])};
    }
    function findLocalPeaks(powers) {
      const peaks = [];
      for (let idx = 1; idx < powers.length - 1; idx += 1) {
        if (powers[idx] >= powers[idx - 1] && powers[idx] > powers[idx + 1]) peaks.push(idx);
      }
      return peaks;
    }
    function spacingGhz(leftNm, rightNm) {
      const c = 299792458;
      return Math.abs(c / (leftNm * 1e-9) - c / (rightNm * 1e-9)) / 1e9;
    }
    function mergeNearbyPeaks(wavelengths, powers, peakIndices, mergeMaxGhz = 20) {
      if (peakIndices.length <= 1 || mergeMaxGhz <= 0) return peakIndices;
      const sorted = [...peakIndices].sort((a, b) => wavelengths[a] - wavelengths[b]);
      const merged = [];
      let group = [sorted[0]];
      for (const idx of sorted.slice(1)) {
        const previous = group[group.length - 1];
        if (spacingGhz(wavelengths[previous], wavelengths[idx]) <= mergeMaxGhz) {
          group.push(idx);
        } else {
          merged.push(group.reduce((best, item) => powers[item] > powers[best] ? item : best, group[0]));
          group = [idx];
        }
      }
      merged.push(group.reduce((best, item) => powers[item] > powers[best] ? item : best, group[0]));
      return merged.sort((a, b) => wavelengths[a] - wavelengths[b]);
    }
    function dedupeNearbyPeaks(wavelengths, powers, peakIndices, mergeMaxGhz = 20) {
      if (peakIndices.length <= 1 || mergeMaxGhz <= 0) return peakIndices;
      const selected = [];
      const strongestFirst = [...peakIndices].sort((a, b) => powers[b] - powers[a]);
      for (const idx of strongestFirst) {
        if (selected.every(kept => spacingGhz(wavelengths[idx], wavelengths[kept]) > mergeMaxGhz)) {
          selected.push(idx);
        }
      }
      return selected.sort((a, b) => wavelengths[a] - wavelengths[b]);
    }
    function envelopeCenter(wavelengths, selectedIndices, fallback) {
      if (selectedIndices.length >= 2) {
        const selected = selectedIndices.map(idx => wavelengths[idx]);
        return (Math.min(...selected) + Math.max(...selected)) / 2;
      }
      if (selectedIndices.length === 1) return wavelengths[selectedIndices[0]];
      return fallback;
    }
    function selectedPeakIndicesForDrop(wavelengths, powers, drop, maxPower, mergePeaks = true) {
      const threshold = maxPower - drop;
      let selectedIndices = findLocalPeaks(powers)
        .filter(idx => powers[idx] >= threshold)
        .sort((a, b) => wavelengths[a] - wavelengths[b]);
      if (!mergePeaks) return selectedIndices;
      return mergeNearbyPeaks(wavelengths, powers, selectedIndices);
    }
    function stabilityPeakIndicesForDrop(wavelengths, powers, drop, maxPower) {
      const threshold = maxPower - drop;
      const selectedIndices = findLocalPeaks(powers)
        .filter(idx => powers[idx] >= threshold)
        .sort((a, b) => wavelengths[a] - wavelengths[b]);
      return dedupeNearbyPeaks(wavelengths, powers, selectedIndices);
    }
    function spacingsForPeakIndices(wavelengths, selectedIndices) {
      const spacings = [];
      for (let idx = 1; idx < selectedIndices.length; idx += 1) {
        spacings.push(spacingGhz(wavelengths[selectedIndices[idx - 1]], wavelengths[selectedIndices[idx]]));
      }
      return spacings;
    }
    function analyzeThreshold(wavelengths, powers, drop) {
      let maxIdx = 0;
      for (let idx = 1; idx < powers.length; idx += 1) if (powers[idx] > powers[maxIdx]) maxIdx = idx;
      const threshold = powers[maxIdx] - drop;
      const stabilityDrop = Number(DATA.stabilityDropDb ?? 30);
      const stabilityThreshold = powers[maxIdx] - stabilityDrop;
      const stabilityIndices = stabilityPeakIndicesForDrop(wavelengths, powers, stabilityDrop, powers[maxIdx]);
      const stabilitySpacings = spacingsForPeakIndices(wavelengths, stabilityIndices);
      const stable = stabilitySpacings.length > 0 && stabilitySpacings.every(spacingPass);
      const selectedIndices = stable ? selectedPeakIndicesForDrop(wavelengths, powers, drop, powers[maxIdx]) : [];
      const spacings = stable ? spacingsForPeakIndices(wavelengths, selectedIndices) : [];
      const centerIndices = selectedIndices.length ? selectedIndices : stabilityIndices;
      return {
        threshold_drop_db: drop,
        threshold_dBm: Number(threshold.toFixed(3)),
        stability_drop_db: stabilityDrop,
        stability_threshold_dBm: Number(stabilityThreshold.toFixed(3)),
        stability_peaks_above_threshold: stabilityIndices.length,
        peaks_above_threshold: selectedIndices.length,
        spacing_rule_passed: stable,
        comb_line_count: selectedIndices.length,
        center_wavelength_nm: Number(envelopeCenter(wavelengths, centerIndices, wavelengths[maxIdx]).toFixed(4)),
        spacings_GHz: spacings.map(value => Number(value.toFixed(3))),
        stability_spacings_GHz: stabilitySpacings.map(value => Number(value.toFixed(3))),
        selected_peaks: selectedIndices.map(idx => ({
          wavelength_nm: Number(wavelengths[idx].toFixed(4)),
          power_dBm: Number(powers[idx].toFixed(3))
        })),
        stability_selected_peaks: stabilityIndices.map(idx => ({
          wavelength_nm: Number(wavelengths[idx].toFixed(4)),
          power_dBm: Number(powers[idx].toFixed(3))
        }))
      };
    }
    function applyCrossThresholdConsistency(analyses) {
      const low = analyses["3"];
      const high = analyses["6"];
      if (!low || !high) return;
      if (Number(low.comb_line_count) <= Number(high.comb_line_count)) return;
      const reason = "3 dB comb count > 6 dB comb count";
      for (const analysis of [low, high]) {
        analysis.spacing_rule_passed = false;
        analysis.comb_line_count = 0;
        analysis.instability_reason = reason;
      }
    }
    function decimateSpectrum(wavelengths, powers, maxPoints = 1600) {
      if (wavelengths.length <= maxPoints) return { wavelengths, powers };
      const bucketCount = Math.max(1, Math.floor(maxPoints / 2));
      const bucketSize = Math.ceil(wavelengths.length / bucketCount);
      const keep = new Set([0, wavelengths.length - 1]);
      for (let start = 0; start < wavelengths.length; start += bucketSize) {
        const end = Math.min(start + bucketSize, wavelengths.length);
        let minIdx = start;
        let maxIdx = start;
        for (let idx = start + 1; idx < end; idx += 1) {
          if (powers[idx] < powers[minIdx]) minIdx = idx;
          if (powers[idx] > powers[maxIdx]) maxIdx = idx;
        }
        keep.add(minIdx);
        keep.add(maxIdx);
      }
      const indices = [...keep].sort((a, b) => a - b);
      return { wavelengths: indices.map(idx => wavelengths[idx]), powers: indices.map(idx => powers[idx]) };
    }
    function spectrumPayloadFromArrays(wavelengths, powers, analyses, centerKey = thresholdKey(activeThreshold)) {
      let maxIdx = 0;
      for (let idx = 1; idx < powers.length; idx += 1) if (powers[idx] > powers[maxIdx]) maxIdx = idx;
      const fallbackKey = thresholdKey(DATA.threshold);
      const centerAnalysis = analyses[centerKey] || analyses[fallbackKey] || Object.values(analyses)[0];
      const center = centerAnalysis.center_wavelength_nm;
      const xMin = center - 15;
      const xMax = center + 15;
      const window = [];
      for (let idx = 0; idx < wavelengths.length; idx += 1) {
        if (xMin <= wavelengths[idx] && wavelengths[idx] <= xMax) window.push([wavelengths[idx], powers[idx]]);
      }
      const thresholds = DATA.thresholds.map(drop => ({
        key: thresholdKey(drop),
        label: `Max - ${trimNumber(drop)} dB`,
        power: Number((powers[maxIdx] - drop).toFixed(3))
      }));
      if (!window.length) {
        return {
          wavelengths: [], powers: [], xMin, xMax, yMin: -80,
          yMax: Math.max(-70, Math.ceil((powers[maxIdx] + 2) / 5) * 5),
          center, maxWavelength: wavelengths[maxIdx], maxPower: powers[maxIdx], thresholds
        };
      }
      const windowWavelengths = window.map(item => item[0]);
      const windowPowers = window.map(item => item[1]);
      const decimated = decimateSpectrum(windowWavelengths, windowPowers);
      let yMax = Math.ceil((Math.max(...windowPowers, ...thresholds.map(item => item.power)) + 2) / 5) * 5;
      if (yMax <= -80) yMax = -70;
      return {
        wavelengths: decimated.wavelengths.map(value => Number(value.toFixed(4))),
        powers: decimated.powers.map(value => Number(value.toFixed(3))),
        xMin: Number(xMin.toFixed(4)),
        xMax: Number(xMax.toFixed(4)),
        yMin: -80,
        yMax,
        center: Number(center.toFixed(4)),
        maxWavelength: Number(wavelengths[maxIdx].toFixed(4)),
        maxPower: Number(powers[maxIdx].toFixed(3)),
        thresholds
      };
    }
    function spectrumPayloadForPoint(point) {
      const raw = rawSpectrumForPoint(point);
      if (raw?.wavelengths?.length) {
        return spectrumPayloadFromArrays(raw.wavelengths, raw.powers, point.analyses, thresholdKey(activeThreshold));
      }
      return DATA.spectra[point.id];
    }
    function selectedFolderName(files) {
      const relative = files.find(file => file.webkitRelativePath)?.webkitRelativePath;
      if (!relative) return `${files.length} selected files`;
      return relative.split(/[\\/]/)[0] || `${files.length} selected files`;
    }
    async function buildDataFromFolderFiles(files) {
      const txtFiles = files.filter(file => file.name.toLowerCase().endsWith(".txt")).sort((a, b) => a.name.localeCompare(b.name));
      if (!txtFiles.length) throw new Error("No txt files found in the selected folder.");
      const points = [];
      const seenConditions = new Set();
      let skippedFiles = 0;
      const spectra = {};
      const rawSpectra = {};
      for (let idx = 0; idx < txtFiles.length; idx += 1) {
        if (idx % 20 === 0) {
          folderStatus.textContent = `Reading spectra ${idx + 1}/${txtFiles.length}...`;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        const file = txtFiles[idx];
        const parsedName = parseCurrentAndBias(file.name);
        if (!Number.isFinite(parsedName.current) || !Number.isFinite(parsedName.bias)) { skippedFiles++; continue; }
        const conditionKey = `${parsedName.current}|${parsedName.bias}`;
        if (seenConditions.has(conditionKey)) throw new Error("Duplicate current/bias condition; load one device and temperature per folder.");
        const parsed = parseSpectrumText(await file.text());
        if (parsed.wavelengths.length < 3) { skippedFiles++; continue; }
        seenConditions.add(conditionKey);
        const analyses = {};
        for (const drop of DATA.thresholds) analyses[thresholdKey(drop)] = analyzeThreshold(parsed.wavelengths, parsed.powers, drop);
        const id = `p${points.length}`;
        points.push({
          id,
          current: parsedName.current,
          bias: parsedName.bias,
          filename: file.webkitRelativePath || file.name,
          analyses
        });
        spectra[id] = spectrumPayloadFromArrays(parsed.wavelengths, parsed.powers, analyses);
        rawSpectra[id] = {
          wavelengths: parsed.wavelengths.map(value => Number(value.toFixed(4))),
          powers: parsed.powers.map(value => Number(value.toFixed(3)))
        };
      }
      if (!points.length) throw new Error("No usable spectra with current/bias filename data were found.");
      points.sort((a, b) => a.current - b.current || a.bias - b.bias || a.filename.localeCompare(b.filename));
      const oldSpectra = { ...spectra };
      const oldRawSpectra = { ...rawSpectra };
      const nextSpectra = {};
      const nextRawSpectra = {};
      points.forEach((point, idx) => {
        const oldId = point.id;
        point.id = `p${idx}`;
        nextSpectra[point.id] = oldSpectra[oldId];
        nextRawSpectra[point.id] = oldRawSpectra[oldId];
      });
      const currents = [...new Set(points.map(point => point.current))].sort((a, b) => a - b);
      const biases = [...new Set(points.map(point => point.bias))].sort((a, b) => a - b);
      const maxCounts = {};
      for (const drop of DATA.thresholds) {
        const key = thresholdKey(drop);
        maxCounts[key] = Math.max(...points.map(point => point.analyses[key].comb_line_count));
      }
      return { ...DATA, skippedFiles, points, spectra: nextSpectra, rawSpectra: nextRawSpectra, currents, biases, maxCounts, stabilityDropDb: Number(DATA.stabilityDropDb ?? 30) };
    }

    function renderMapping() {
      const key = thresholdKey(activeThreshold);
      const currents = DATA.currents;
      const biases = DATA.biases.slice().reverse();
      const cellW = 44;
      const cellH = 32;
      const left = 88;
      const top = 52;
      const right = 190;
      const bottom = 90;
      const gridW = currents.length * cellW;
      const gridH = biases.length * cellH;
      const width = left + gridW + right;
      const height = top + gridH + bottom;
      const pointMap = new Map(DATA.points.map(point => [`${point.current}|${point.bias}`, point]));
      const maxCount = DATA.maxCounts[key] || 0;
      mappingSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      mappingSvg.replaceChildren();

      for (let yIdx = 0; yIdx < biases.length; yIdx += 1) {
        const bias = biases[yIdx];
        for (let xIdx = 0; xIdx < currents.length; xIdx += 1) {
          const current = currents[xIdx];
          const point = pointMap.get(`${current}|${bias}`);
          const count = point ? point.analyses[key]?.comb_line_count ?? null : null;
          const color = colorForValue(count, maxCount);
          const x = left + xIdx * cellW;
          const y = top + yIdx * cellH;
          const rect = svgEl("rect", {
            x, y, width: cellW, height: cellH,
            fill: colorToString(color),
            class: `cell ${selectedPoint && point && selectedPoint.id === point.id ? "selected" : ""}`,
            tabindex: "0",
            role: "button"
          });
          if (point) {
            rect.addEventListener("click", () => selectPoint(point));
            rect.addEventListener("keydown", event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectPoint(point);
              }
            });
          }
          mappingSvg.appendChild(rect);
          const label = svgEl("text", {
            x: x + cellW / 2,
            y: y + cellH / 2 + 1,
            fill: textColorForBackground(color),
            class: "cell-label"
          });
          label.textContent = count == null ? "" : String(count);
          mappingSvg.appendChild(label);
        }
      }
      mappingSvg.appendChild(svgEl("rect", { x: left, y: top, width: gridW, height: gridH, fill: "none", stroke: "#222831", "stroke-width": 2 }));
      for (let xIdx = 0; xIdx < currents.length; xIdx += 1) {
        const x = left + xIdx * cellW + cellW / 2;
        mappingSvg.appendChild(svgEl("line", { x1: x, y1: top + gridH, x2: x, y2: top + gridH + 7, stroke: "#222831" }));
        const text = svgEl("text", { x, y: top + gridH + 45, class: "tick-label", transform: `rotate(45 ${x} ${top + gridH + 45})`, "text-anchor": "middle" });
        text.textContent = trimNumber(currents[xIdx]);
        mappingSvg.appendChild(text);
      }
      for (let yIdx = 0; yIdx < biases.length; yIdx += 1) {
        const y = top + yIdx * cellH + cellH / 2;
        mappingSvg.appendChild(svgEl("line", { x1: left - 7, y1: y, x2: left, y2: y, stroke: "#222831" }));
        const text = svgEl("text", { x: left - 13, y: y + 4, class: "tick-label", "text-anchor": "end" });
        text.textContent = trimNumber(biases[yIdx]);
        mappingSvg.appendChild(text);
      }
      const xLabel = svgEl("text", { x: left + gridW / 2, y: height - 14, class: "axis-label", "text-anchor": "middle" });
      xLabel.textContent = "Current (mA)";
      mappingSvg.appendChild(xLabel);
      const yLabel = svgEl("text", { x: 20, y: top + gridH / 2, class: "axis-label", "text-anchor": "middle", transform: `rotate(-90 20 ${top + gridH / 2})` });
      yLabel.textContent = "Reverse bias (V)";
      mappingSvg.appendChild(yLabel);
      renderColorbar(left + gridW + 66, top, 24, gridH, maxCount);
      mappingStatus.textContent = `${currents.length} current points x ${DATA.biases.length} voltage points, max comb number ${maxCount}`;
      updateCriterionStatus();
    }

    function renderColorbar(x, y, width, height, maximum) {
      const defs = svgEl("defs");
      const gradient = svgEl("linearGradient", { id: "combGradient", x1: "0", y1: "1", x2: "0", y2: "0" });
      for (const [stop, color] of palette) gradient.appendChild(svgEl("stop", { offset: `${stop * 100}%`, "stop-color": colorToString(color) }));
      defs.appendChild(gradient);
      mappingSvg.appendChild(defs);
      mappingSvg.appendChild(svgEl("rect", { x, y, width, height, fill: "url(#combGradient)", stroke: "#222831" }));
      const label = svgEl("text", { x: x + width / 2, y: y - 18, class: "axis-label", "text-anchor": "middle" });
      label.textContent = "Comb number";
      mappingSvg.appendChild(label);
      const step = Math.max(1, Math.ceil(maximum / 6));
      for (let value = 0; value <= maximum; value += step) {
        const tickY = y + height - (maximum > 0 ? value / maximum : 0) * height;
        mappingSvg.appendChild(svgEl("line", { x1: x + width, y1: tickY, x2: x + width + 7, y2: tickY, stroke: "#222831" }));
        const tick = svgEl("text", { x: x + width + 12, y: tickY + 4, class: "tick-label" });
        tick.textContent = String(value);
        mappingSvg.appendChild(tick);
      }
    }

    function resizeSpectrumCanvas() {
      const ratio = window.devicePixelRatio || 1;
      const rect = spectrumCanvas.getBoundingClientRect();
      spectrumCanvas.width = Math.max(1, Math.round(rect.width * ratio));
      spectrumCanvas.height = Math.max(1, Math.round(rect.height * ratio));
      spectrumCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
    function clearSpectrumZoom() {
      spectrumZoom = null;
      spectrumDrag = null;
    }
    function resetSpectrumZoom() {
      clearSpectrumZoom();
      drawSpectrum();
    }
    function zoomIsActiveForSelectedPoint() {
      return Boolean(spectrumZoom && selectedPoint && spectrumZoom.pointId === selectedPoint.id);
    }
    function applySpectrumZoom(spectrum) {
      if (!zoomIsActiveForSelectedPoint()) return spectrum;
      const xMin = Math.max(spectrum.xMin, Math.min(spectrumZoom.xMin, spectrumZoom.xMax));
      const xMax = Math.min(spectrum.xMax, Math.max(spectrumZoom.xMin, spectrumZoom.xMax));
      if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax - xMin < 0.02) return spectrum;
      return { ...spectrum, xMin, xMax };
    }
    function canvasPoint(event) {
      const rect = spectrumCanvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }
    function pointInsidePlot(point, plot) {
      return Boolean(plot && point.x >= plot.left && point.x <= plot.right && point.y >= plot.top && point.y <= plot.bottom);
    }
    function wavelengthAtCanvasX(x, plot) {
      const clampedX = clamp(x, plot.left, plot.right);
      return plot.xMin + (clampedX - plot.left) / plot.width * (plot.xMax - plot.xMin);
    }
    function drawZoomOverlay(plot) {
      if (!spectrumDrag || !pointInsidePlot({ x: spectrumDrag.startX, y: (plot.top + plot.bottom) / 2 }, plot)) return;
      const x1 = clamp(spectrumDrag.startX, plot.left, plot.right);
      const x2 = clamp(spectrumDrag.currentX, plot.left, plot.right);
      if (Math.abs(x2 - x1) < 2) return;
      const x = Math.min(x1, x2);
      const width = Math.abs(x2 - x1);
      spectrumCtx.save();
      spectrumCtx.fillStyle = "rgba(21, 93, 159, 0.16)";
      spectrumCtx.strokeStyle = "#155d9f";
      spectrumCtx.lineWidth = 1.4;
      spectrumCtx.fillRect(x, plot.top, width, plot.height);
      spectrumCtx.strokeRect(x, plot.top, width, plot.height);
      spectrumCtx.restore();
    }
    function drawDashedLine(context, x1, y1, x2, y2, dash = 8, gap = 6) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (!length) return;
      let distance = 0;
      context.beginPath();
      while (distance < length) {
        const start = distance / length;
        const end = Math.min((distance + dash) / length, 1);
        context.moveTo(x1 + dx * start, y1 + dy * start);
        context.lineTo(x1 + dx * end, y1 + dy * end);
        distance += dash + gap;
      }
      context.stroke();
    }
    function drawSpectrum() {
      const ratio = window.devicePixelRatio || 1;
      const width = spectrumCanvas.width / ratio;
      const height = spectrumCanvas.height / ratio;
      spectrumCtx.clearRect(0, 0, width, height);
      spectrumCtx.fillStyle = "#fff";
      spectrumCtx.fillRect(0, 0, width, height);
      if (!selectedPoint) {
        lastSpectrumPlot = null;
        resetSpectrumZoomButton.disabled = true;
        spectrumTitle.textContent = "Spectrum";
        spectrumAnalysisDetails.replaceChildren();
        spectrumCtx.fillStyle = "#59636f";
        spectrumCtx.font = "18px Arial";
        spectrumCtx.fillText("Click a mapping cell to show its optical spectrum.", 28, 52);
        return;
      }
      let spectrum = spectrumPayloadForPoint(selectedPoint);
      if (!spectrum || !spectrum.wavelengths.length) {
        lastSpectrumPlot = null;
        resetSpectrumZoomButton.disabled = true;
        spectrumTitle.textContent = "Spectrum unavailable";
        spectrumAnalysisDetails.replaceChildren();
        spectrumCtx.fillStyle = "#59636f";
        spectrumCtx.font = "18px Arial";
        spectrumCtx.fillText("No spectrum data was found for this point.", 28, 52);
        return;
      }
      spectrum = applySpectrumZoom(spectrum);
      resetSpectrumZoomButton.disabled = !zoomIsActiveForSelectedPoint();
      spectrumTitle.textContent = `Spectrum: ${trimNumber(selectedPoint.current)} mA, ${trimNumber(selectedPoint.bias)} V`;
      const plot = { left: 82, right: width - 28, top: 42, bottom: height - 62 };
      plot.width = plot.right - plot.left;
      plot.height = plot.bottom - plot.top;
      plot.xMin = spectrum.xMin;
      plot.xMax = spectrum.xMax;
      plot.x = value => plot.left + (value - spectrum.xMin) / (spectrum.xMax - spectrum.xMin) * plot.width;
      plot.y = value => plot.top + (spectrum.yMax - value) / (spectrum.yMax - spectrum.yMin) * plot.height;
      lastSpectrumPlot = plot;

      spectrumCtx.strokeStyle = "#dfe5ec";
      spectrumCtx.lineWidth = 1;
      spectrumCtx.fillStyle = "#222831";
      spectrumCtx.font = "13px Arial";
      for (let tick = Math.ceil(spectrum.xMin / 2) * 2; tick <= spectrum.xMax + 1e-9; tick += 2) {
        const x = plot.x(tick);
        spectrumCtx.beginPath();
        spectrumCtx.moveTo(x, plot.top);
        spectrumCtx.lineTo(x, plot.bottom);
        spectrumCtx.stroke();
        const label = trimNumber(tick);
        const metrics = spectrumCtx.measureText(label);
        spectrumCtx.fillText(label, x - metrics.width / 2, plot.bottom + 22);
      }
      for (let tick = Math.ceil(spectrum.yMin / 10) * 10; tick <= spectrum.yMax + 1e-9; tick += 10) {
        const y = plot.y(tick);
        spectrumCtx.beginPath();
        spectrumCtx.moveTo(plot.left, y);
        spectrumCtx.lineTo(plot.right, y);
        spectrumCtx.stroke();
        const label = trimNumber(tick);
        const metrics = spectrumCtx.measureText(label);
        spectrumCtx.fillText(label, plot.left - metrics.width - 10, y + 4);
      }

      spectrumCtx.strokeStyle = "#155d9f";
      spectrumCtx.lineWidth = 1.5;
      spectrumCtx.save();
      spectrumCtx.beginPath();
      spectrumCtx.rect(plot.left, plot.top, plot.width, plot.height);
      spectrumCtx.clip();
      spectrumCtx.beginPath();
      let drawingSpectrum = false;
      for (let idx = 0; idx < spectrum.wavelengths.length; idx += 1) {
        const power = spectrum.powers[idx];
        if (power < spectrum.yMin || power > spectrum.yMax) {
          drawingSpectrum = false;
          continue;
        }
        const x = plot.x(spectrum.wavelengths[idx]);
        const y = plot.y(power);
        if (!drawingSpectrum) {
          spectrumCtx.moveTo(x, y);
          drawingSpectrum = true;
        } else {
          spectrumCtx.lineTo(x, y);
        }
      }
      spectrumCtx.stroke();
      spectrumCtx.restore();

      const activeThresholdKey = thresholdKey(activeThreshold);
      const activeThresholdLine = spectrum.thresholds.find(item => item.key === activeThresholdKey);
      if (activeThresholdLine && spectrum.yMin <= activeThresholdLine.power && activeThresholdLine.power <= spectrum.yMax) {
        const item = activeThresholdLine;
        const y = plot.y(item.power);
        const color = thresholdColor(item.key);
        spectrumCtx.strokeStyle = color;
        spectrumCtx.lineWidth = 1.4;
        drawDashedLine(spectrumCtx, plot.left, y, plot.right, y);
        spectrumCtx.fillStyle = color;
        spectrumCtx.font = "13px Arial";
        spectrumCtx.fillText(item.label, plot.right - 92, y - 5);
      }
      const peakStyles = [{ key: activeThresholdKey, color: thresholdColor(activeThresholdKey), ring: false }];
      for (const style of peakStyles) {
        const analysis = selectedPoint.analyses[style.key];
        if (!analysis) continue;
        for (const peak of analysis.selected_peaks) {
          if (peak.wavelength_nm < spectrum.xMin || peak.wavelength_nm > spectrum.xMax) continue;
          const x = plot.x(peak.wavelength_nm);
          const y = plot.y(peak.power_dBm);
          spectrumCtx.beginPath();
          spectrumCtx.arc(x, y, style.ring ? 6 : 4.5, 0, Math.PI * 2);
          if (style.ring) {
            spectrumCtx.strokeStyle = style.color;
            spectrumCtx.lineWidth = 2;
            spectrumCtx.stroke();
          } else {
            spectrumCtx.fillStyle = style.color;
            spectrumCtx.fill();
          }
        }
      }
      if (spectrum.xMin <= spectrum.center && spectrum.center <= spectrum.xMax) {
        const centerX = plot.x(spectrum.center);
        spectrumCtx.strokeStyle = "#555";
        spectrumCtx.lineWidth = 1.2;
        drawDashedLine(spectrumCtx, centerX, plot.top, centerX, plot.bottom, 6, 5);
      }
      spectrumCtx.strokeStyle = "#222831";
      spectrumCtx.lineWidth = 2;
      spectrumCtx.strokeRect(plot.left, plot.top, plot.width, plot.height);
      spectrumCtx.fillStyle = "#222831";
      spectrumCtx.font = "18px Arial";
      let label = "Wavelength (nm)";
      let metrics = spectrumCtx.measureText(label);
      spectrumCtx.fillText(label, plot.left + plot.width / 2 - metrics.width / 2, height - 20);
      label = "Intensity (dBm)";
      spectrumCtx.save();
      spectrumCtx.translate(22, plot.top + plot.height / 2);
      spectrumCtx.rotate(-Math.PI / 2);
      metrics = spectrumCtx.measureText(label);
      spectrumCtx.fillText(label, -metrics.width / 2, 0);
      spectrumCtx.restore();
      drawZoomOverlay(plot);
      renderSpectrumAnalysisDetails();
    }

    function addTableCell(row, text, className = "") {
      const cell = document.createElement("td");
      if (className) cell.className = className;
      cell.textContent = text;
      row.appendChild(cell);
      return cell;
    }
    function createAnalysisTable(headers) {
      const table = document.createElement("table");
      table.className = "analysis-table";
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const header of headers) {
        const th = document.createElement("th");
        th.textContent = header;
        headRow.appendChild(th);
      }
      head.appendChild(headRow);
      table.appendChild(head);
      table.appendChild(document.createElement("tbody"));
      return table;
    }
    function appendEmptyRow(table, message) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = table.querySelectorAll("th").length;
      cell.textContent = message;
      row.appendChild(cell);
      table.querySelector("tbody").appendChild(row);
    }
    function renderSpectrumAnalysisDetails() {
      spectrumAnalysisDetails.replaceChildren();
      if (!selectedPoint) return;
      for (const drop of DATA.thresholds) {
        const key = thresholdKey(drop);
        const analysis = selectedPoint.analyses[key];
        if (!analysis) continue;
        const box = document.createElement("div");
        box.className = "analysis-box";

        const title = document.createElement("div");
        title.className = "analysis-title";
        const titleText = document.createElement("span");
        titleText.textContent = `Max - ${trimNumber(drop)} dB`;
        const badge = document.createElement("span");
        badge.className = "analysis-badge";
        badge.textContent = `comb ${analysis.comb_line_count} | ${analysis.spacing_rule_passed ? "spacing rule passed" : "spacing rule failed"}`;
        title.append(titleText, badge);
        box.appendChild(title);
        if (analysis.instability_reason) {
          const note = document.createElement("div");
          note.className = "analysis-note";
          note.textContent = analysis.instability_reason;
          box.appendChild(note);
        }

        const peakSubtitle = document.createElement("div");
        peakSubtitle.className = "analysis-subtitle";
        peakSubtitle.textContent = "Detected peaks after merging";
        box.appendChild(peakSubtitle);
        const peakTable = createAnalysisTable(["Peak", "Wavelength (nm)", "Power (dBm)"]);
        if (analysis.selected_peaks.length) {
          analysis.selected_peaks.forEach((peak, idx) => {
            const row = document.createElement("tr");
            addTableCell(row, String(idx + 1));
            addTableCell(row, formatNumber(peak.wavelength_nm, 4));
            addTableCell(row, formatNumber(peak.power_dBm, 3));
            peakTable.querySelector("tbody").appendChild(row);
          });
        } else {
          appendEmptyRow(peakTable, "No peak above this threshold.");
        }
        box.appendChild(peakTable);

        const spacingSubtitle = document.createElement("div");
        spacingSubtitle.className = "analysis-subtitle";
        spacingSubtitle.textContent = `Comb spacing (${trimNumber(DATA.spacingMinGHz)}-${trimNumber(DATA.spacingMaxGHz)} GHz criterion)`;
        box.appendChild(spacingSubtitle);
        const spacingTable = createAnalysisTable(["Pair", "Spacing (GHz)", "Pass"]);
        if (analysis.spacings_GHz.length) {
          analysis.spacings_GHz.forEach((spacing, idx) => {
            const pass = spacingPass(spacing);
            const row = document.createElement("tr");
            addTableCell(row, `${idx + 1}-${idx + 2}`);
            addTableCell(row, formatNumber(spacing, 3));
            addTableCell(row, pass ? "YES" : "NO", pass ? "pass" : "fail");
            spacingTable.querySelector("tbody").appendChild(row);
          });
        } else {
          appendEmptyRow(spacingTable, "Need at least two detected peaks.");
        }
        box.appendChild(spacingTable);
        spectrumAnalysisDetails.appendChild(box);
      }
    }

    function metric(label, value) {
      const row = document.createElement("div");
      row.className = "metric";
      const left = document.createElement("div");
      left.className = "metric-label";
      left.textContent = label;
      const right = document.createElement("div");
      right.className = "metric-value";
      right.textContent = value;
      row.append(left, right);
      return row;
    }
    function updateDetails() {
      pointDetails.replaceChildren();
      if (!selectedPoint) {
        pointDetails.append(metric("Point", "None"));
        return;
      }
      const a3 = selectedPoint.analyses["3"];
      const a6 = selectedPoint.analyses["6"];
      const activeAnalysis = selectedPoint.analyses[thresholdKey(activeThreshold)] || a6 || a3;
      const ruleNote = a3.instability_reason || a6.instability_reason;
      pointDetails.append(
        metric("Current", `${trimNumber(selectedPoint.current)} mA`),
        metric("Reverse bias", `${trimNumber(selectedPoint.bias)} V`),
        metric("Active dB", `${trimNumber(activeThreshold)} dB`),
        metric("Screening depth dB", `${trimNumber(DATA.stabilityDropDb ?? 30)} dB`),
        metric("Center", `${formatNumber(activeAnalysis.center_wavelength_nm, 3)} nm`),
        metric("Criterion", criterionText()),
        metric("Active comb", String(activeAnalysis.comb_line_count)),
        metric("Spacing rule passed", activeAnalysis.spacing_rule_passed ? "YES" : "NO"),
        metric("3 dB comb", String(a3.comb_line_count)),
        metric("6 dB comb", String(a6.comb_line_count)),
        metric("3 dB rule passed", a3.spacing_rule_passed ? "YES" : "NO"),
        metric("6 dB rule passed", a6.spacing_rule_passed ? "YES" : "NO"),
        metric("File", selectedPoint.filename)
      );
      if (ruleNote) pointDetails.append(metric("Rule note", ruleNote));
    }
    function selectPoint(point) {
      clearSpectrumZoom();
      selectedPoint = point;
      updateDetails();
      renderMapping();
      drawSpectrum();
    }
    function bestPoint() {
      const key = thresholdKey(activeThreshold);
      return [...DATA.points].sort((a, b) => (
        (b.analyses[key]?.comb_line_count || 0) - (a.analyses[key]?.comb_line_count || 0) ||
        a.current - b.current ||
        a.bias - b.bias
      ))[0] || null;
    }
    function applyViewerData(nextData, statusText) {
      DATA = nextData;
      clearSpectrumZoom();
      setVisibleThresholds(DATA.customThreshold);
      setSpacingInputsFromData();
      setThresholdButtonStates();
      selectedPoint = bestPoint();
      folderStatus.textContent = statusText;
      renderMapping();
      updateDetails();
      drawSpectrum();
    }
    folderPicker.addEventListener("change", async event => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      const folderName = selectedFolderName(files);
      folderPicker.disabled = true;
      folderStatus.textContent = `Reading ${folderName}...`;
      try {
        const nextData = await buildDataFromFolderFiles(files);
        applyViewerData(nextData, `${folderName}: ${nextData.points.length} spectra loaded; ${nextData.skippedFiles || 0} files skipped`);
      } catch (error) {
        folderStatus.textContent = `Failed to load folder: ${error.message}`;
      } finally {
        folderPicker.value = "";
        folderPicker.disabled = false;
      }
    });
    for (const button of document.querySelectorAll(".threshold-button")) {
      button.addEventListener("click", () => {
        activeThreshold = Number(button.dataset.threshold);
        setThresholdButtonStates();
        updatePageTitle();
        clearSpectrumZoom();
        selectedPoint = bestPoint();
        renderMapping();
        updateDetails();
        drawSpectrum();
      });
    }
    applyThresholdButton.addEventListener("click", applyCustomThreshold);
    customThresholdInput.addEventListener("keydown", event => {
      if (event.key === "Enter") applyCustomThreshold();
    });
    applySpacingButton.addEventListener("click", applySpacingInputs);
    for (const input of [spacingTargetInput, spacingToleranceInput]) {
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") applySpacingInputs();
      });
    }
    resetSpectrumZoomButton.addEventListener("click", resetSpectrumZoom);
    spectrumCanvas.addEventListener("dblclick", resetSpectrumZoom);
    spectrumCanvas.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !selectedPoint || !lastSpectrumPlot) return;
      const point = canvasPoint(event);
      if (!pointInsidePlot(point, lastSpectrumPlot)) return;
      event.preventDefault();
      const x = clamp(point.x, lastSpectrumPlot.left, lastSpectrumPlot.right);
      spectrumDrag = { pointId: selectedPoint.id, startX: x, currentX: x };
      spectrumCanvas.setPointerCapture?.(event.pointerId);
      drawSpectrum();
    });
    spectrumCanvas.addEventListener("pointermove", event => {
      if (!spectrumDrag || !lastSpectrumPlot) return;
      event.preventDefault();
      const point = canvasPoint(event);
      spectrumDrag.currentX = clamp(point.x, lastSpectrumPlot.left, lastSpectrumPlot.right);
      drawSpectrum();
    });
    spectrumCanvas.addEventListener("pointerup", event => {
      if (!spectrumDrag || !lastSpectrumPlot || !selectedPoint) return;
      event.preventDefault();
      spectrumCanvas.releasePointerCapture?.(event.pointerId);
      const startX = spectrumDrag.startX;
      const endX = spectrumDrag.currentX;
      const plot = lastSpectrumPlot;
      const pointId = spectrumDrag.pointId;
      spectrumDrag = null;
      if (Math.abs(endX - startX) >= 8 && pointId === selectedPoint.id) {
        const xMin = wavelengthAtCanvasX(Math.min(startX, endX), plot);
        const xMax = wavelengthAtCanvasX(Math.max(startX, endX), plot);
        if (xMax - xMin >= 0.05) spectrumZoom = { pointId, xMin, xMax };
      }
      drawSpectrum();
    });
    spectrumCanvas.addEventListener("pointercancel", () => {
      spectrumDrag = null;
      drawSpectrum();
    });
    window.addEventListener("resize", () => {
      resizeSpectrumCanvas();
      drawSpectrum();
    });

    resizeSpectrumCanvas();
    setVisibleThresholds();
    setSpacingInputsFromData();
    setThresholdButtonStates();
    updatePageTitle();
    selectedPoint = bestPoint();
    renderMapping();
    updateDetails();
    drawSpectrum();

    async function loadSyntheticDemo() {
      document.getElementById("filenameFormat").value = "explicit";
      const files = [];
      for (const current of [60, 100, 140]) {
        for (const bias of [0, 1, 2]) {
          const lines = ["# SYNTHETIC: wavelength_nm power_dBm"];
          const center = 1300 + bias * 0.08;
          for (let idx = 0; idx <= 2000; idx++) {
            const wavelength = 1294 + idx * 0.006;
            let powerMw = 1e-8;
            for (let mode = -3; mode <= 3; mode++) {
              const frequencyThz = 299792.458 / center + mode * 0.2;
              const peakNm = 299792.458 / frequencyThz;
              const amplitude = 0.01 * (current / 100) * Math.exp(-0.25 * mode * mode);
              powerMw += amplitude * Math.exp(-0.5 * ((wavelength - peakNm) / 0.025) ** 2);
            }
            lines.push(`${wavelength.toFixed(6)} ${ (10 * Math.log10(powerMw)).toFixed(6)}`);
          }
          const text = lines.join("\n");
          files.push({name: `SYNTHETIC_I${current}mA_V${bias}V.txt`, text: async () => text});
        }
      }
      applyViewerData(await buildDataFromFolderFiles(files), "SYNTHETIC demo: 9 spectra; no laboratory data");
    }
    document.getElementById("loadDemo").addEventListener("click", () => loadSyntheticDemo().catch(error => {folderStatus.textContent = error.message;}));
    document.getElementById("exportResults").addEventListener("click", () => {
      const payload = {schema_version: "0.1.0", method: "spectral-spacing-screen", units: {current: "mA", bias: "V", wavelength: "nm", power: "dBm", spacing: "GHz"},
        parameters: {spacing_min_GHz: DATA.spacingMinGHz, spacing_max_GHz: DATA.spacingMaxGHz, screening_drop_dB: DATA.stabilityDropDb, thresholds_dB: DATA.thresholds},
        points: DATA.points};
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"}));
      const link = document.createElement("a"); link.href = url; link.download = "spectral-analysis.json"; link.click(); URL.revokeObjectURL(url);
    });
    loadSyntheticDemo().catch(error => { folderStatus.textContent = error.message; });

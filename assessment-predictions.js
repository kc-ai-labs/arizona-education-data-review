(function attachAssessmentPredictions(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (!root) return;
  root.HeliosAssessmentPredictions = Object.freeze(api);
  if (!root.document) return;
  const start = () => api.bootstrap(root.document, root);
  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : null, function buildAssessmentPredictions() {
  const DEFAULTS = Object.freeze({
    subject: "Mathematics",
    testLevel: "All Assessments",
    subgroup: "All Students",
    fayStatus: "FAY"
  });
  const MODEL_GOVERNANCE_CAVEAT_W0 = "Model governance: FY2025 backtesting showed recent trends did not improve next-year accuracy, so the FY2026 indicator carries the latest actual score forward with an evidence-based likely range. The trend classification describes the past three years. FY2030 is an illustration of where the school would land if its recent trend continued.";
  const ADVANCED_RESIDUAL_HALF_SCALE = 20;

  function governanceText(dampingWeight, options = {}) {
    const includeFy2030 = options.includeFy2030 !== false;
    const w = dampingWeight == null ? 0 : dampingWeight;
    const fy2030Text = includeFy2030
      ? " FY2030 is an illustration of where the school would land if its recent trend continued."
      : "";
    if (w === 0) {
      return includeFy2030
        ? MODEL_GOVERNANCE_CAVEAT_W0
        : "Model governance: FY2025 backtesting showed recent trends did not improve next-year accuracy, so the FY2026 indicator carries the latest actual score forward with an evidence-based likely range. The trend classification describes the past three years.";
    }
    return "Model governance: FY2025 backtesting supported blending the latest actual score with part of the recent trend (weight " + w + "). The FY2026 indicator reflects that blend with an evidence-based likely range. The trend classification describes the past three years." + fy2030Text;
  }

  function fittedYearCount(detail) {
    return detail.fittedYears ? detail.fittedYears.split(",").filter(Boolean).length : 0;
  }

  function qs(doc, id) {
    return doc.getElementById(id);
  }

  function safeText(value) {
    return value == null || value === "" ? "-" : String(value);
  }

  function titleText(value) {
    return safeText(value).replace(/_/g, " ");
  }

  function formatPercent(value, digits = 1) {
    if (value == null || value === "") return "-";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "-";
    return `${numeric.toFixed(digits)}%`;
  }

  function formatSigned(value, digits = 1) {
    if (value == null || value === "") return "-";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "-";
    const prefix = numeric > 0 ? "+" : "";
    return `${prefix}${numeric.toFixed(digits)} pts`;
  }

  function chartTooltipText(point, detail) {
    const year = safeText(point?.year);
    const value = formatPercent(point?.value);
    if (point?.kind === "actual") {
      return `Actual FY${year}: ${value} passing. Observed assessment result.`;
    }
    if (point?.kind === "forecast") {
      const low = detail?.forecast2026Low;
      const high = detail?.forecast2026High;
      const hasRange = low != null && high != null && Number.isFinite(Number(low)) && Number.isFinite(Number(high));
      const method = detail?.dampingWeight === 0 || detail?.dampingWeight == null
        ? "Carries the latest actual forward"
        : "Blends the latest actual with the recent trend";
      const rangeText = hasRange ? `; backtest-calibrated likely range ${formatPercent(low)} to ${formatPercent(high)}` : "";
      return `FY2026 indicator: ${value} passing. ${method}${rangeText}.`;
    }
    if (point?.kind === "illustration") {
      return `FY2030 if-trend-continues: ${value} passing. Illustrative extrapolation, not a decision-ready prediction.`;
    }
    return `FY${year}: ${value} passing.`;
  }

  function bandTooltipText(detail) {
    const low = detail?.forecast2026Low;
    const high = detail?.forecast2026High;
    if (low == null || high == null || !Number.isFinite(Number(low)) || !Number.isFinite(Number(high))) {
      return "FY2026 likely range. Calibrated from historical backtest errors.";
    }
    return `FY2026 likely range: ${formatPercent(low)} to ${formatPercent(high)}. Backtest-calibrated band based on the 80th percentile of historical absolute errors.`;
  }

  function buildQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      const text = String(value == null ? "" : value).trim();
      if (text.length) search.set(key, text);
    });
    const query = search.toString();
    return query ? `?${query}` : "";
  }

  function defaultSchoolCodeFromOptions(options) {
    const text = String(options?.defaultSchoolCode == null ? "" : options.defaultSchoolCode).trim();
    return /^\d+$/.test(text) ? text : "";
  }

  function defaultAdvancedSchoolCodeFromOptions(options, subject) {
    const bySubject = options?.defaultAdvancedSchoolCodeBySubject || {};
    const subjectCode = String(bySubject?.[subject] == null ? "" : bySubject[subject]).trim();
    if (/^\d+$/.test(subjectCode)) return subjectCode;
    const defaultCode = String(options?.defaultAdvancedSchoolCode == null ? "" : options.defaultAdvancedSchoolCode).trim();
    return /^\d+$/.test(defaultCode) ? defaultCode : "";
  }

  function schoolOptionLabel(school) {
    const code = String(school?.schoolCode == null ? "" : school.schoolCode).trim();
    const name = String(school?.schoolName == null ? "" : school.schoolName).trim();
    const district = String(school?.districtName == null ? "" : school.districtName).trim();
    const base = name ? `${name} (${code || "-"})` : code ? `School ${code}` : "Unknown school";
    return district ? `${base} | ${district}` : base;
  }

  function schoolShortLabelFromOptions(options, schoolCode) {
    const code = String(schoolCode == null ? "" : schoolCode).trim();
    const schools = Array.isArray(options?.schools) ? options.schools : [];
    const school = schools.find(item => String(item?.schoolCode) === code);
    if (!school) return code ? `School ${code}` : "Selected school";
    const name = String(school.schoolName == null ? "" : school.schoolName).trim();
    return name ? `${name} (${code})` : `School ${code}`;
  }

  function advancedSnapNoteText(options, originalSchoolCode, snappedSchoolCode, subject) {
    const shown = schoolShortLabelFromOptions(options, snappedSchoolCode);
    const original = schoolShortLabelFromOptions(options, originalSchoolCode);
    const subjectText = String(subject || "this subject").trim() || "this subject";
    return `Showing ${shown} - ${original} has no advanced data for ${subjectText}.`;
  }

  function schoolCodeFromInput(value) {
    const text = String(value == null ? "" : value).trim();
    if (/^\d+$/.test(text)) return text;
    const parenMatch = text.match(/\((\d+)\)/);
    if (parenMatch) return parenMatch[1];
    const anyCode = text.match(/\b\d{3,}\b/);
    return anyCode ? anyCode[0] : "";
  }

  function setSchoolOptions(doc, schools, defaultSchoolCode) {
    const input = qs(doc, "assessment-school");
    const datalist = qs(doc, "assessment-school-list");
    if (!input || !datalist) return "";
    const previousCode = schoolCodeFromInput(input.value);
    const defaultCode = defaultSchoolCodeFromOptions({ defaultSchoolCode });
    const normalized = (schools || [])
      .map(school => ({
        schoolCode: String(school?.schoolCode == null ? "" : school.schoolCode).trim(),
        schoolName: school?.schoolName || "",
        districtName: school?.districtName || ""
      }))
      .filter(school => /^\d+$/.test(school.schoolCode));

    datalist.innerHTML = "";
    if (!normalized.length) {
      input.value = "";
      input.placeholder = "No schools available";
      return "";
    }

    normalized.forEach(school => {
      const option = doc.createElement("option");
      option.value = schoolOptionLabel(school);
      option.setAttribute("data-school-code", school.schoolCode);
      datalist.appendChild(option);
    });

    const codes = normalized.map(school => school.schoolCode);
    const schoolByCode = new Map(normalized.map(school => [school.schoolCode, school]));
    let selectedCode = "";
    if (previousCode && codes.includes(previousCode)) {
      selectedCode = previousCode;
    } else if (defaultCode && codes.includes(defaultCode)) {
      selectedCode = defaultCode;
    } else {
      selectedCode = codes[0];
    }
    input.value = schoolOptionLabel(schoolByCode.get(selectedCode));
    return selectedCode;
  }

  function setSchoolInputFromOptions(doc, options, schoolCode) {
    const input = qs(doc, "assessment-school");
    if (!input) return false;
    const code = String(schoolCode == null ? "" : schoolCode).trim();
    if (!/^\d+$/.test(code)) return false;
    const schools = Array.isArray(options?.schools) ? options.schools : [];
    const school = schools.find(item => String(item?.schoolCode) === code);
    input.value = school ? schoolOptionLabel(school) : code;
    return true;
  }

  function setText(doc, id, value) {
    const el = qs(doc, id);
    if (el) el.textContent = value;
  }

  function readHorizon(doc) {
    const toggle = qs(doc, "assessment-show-fy2030");
    return { includeFy2030: toggle ? toggle.checked !== false : true };
  }

  function applyFy2030Visibility(doc, includeFy2030) {
    if (!doc.querySelectorAll) return;
    doc.querySelectorAll("[data-fy2030-visibility]").forEach(node => {
      node.hidden = !includeFy2030;
    });
  }

  function showError(doc, message) {
    const el = qs(doc, "assessment-api-error");
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
  }

  function clearError(doc) {
    const el = qs(doc, "assessment-api-error");
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
  }

  function showAdvancedSnapNote(doc, message) {
    const note = qs(doc, "assessment-advanced-snap-note");
    const text = qs(doc, "assessment-advanced-snap-text");
    if (!note || !text) return;
    text.textContent = message;
    note.hidden = false;
  }

  function clearAdvancedSnapNote(doc) {
    const note = qs(doc, "assessment-advanced-snap-note");
    const text = qs(doc, "assessment-advanced-snap-text");
    if (text) text.textContent = "";
    if (note) note.hidden = true;
  }

  function setOptions(doc, id, values, preferredValue) {
    const select = qs(doc, id);
    if (!select) return;
    const ordered = Array.from(new Set([preferredValue, ...(values || [])].filter(Boolean)));
    select.innerHTML = "";
    ordered.forEach(value => {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = ordered.includes(preferredValue) ? preferredValue : ordered[0] || "";
    select.disabled = ordered.length <= 1;
  }

  function readFilters(doc) {
    return {
      schoolCode: schoolCodeFromInput(qs(doc, "assessment-school")?.value),
      subject: qs(doc, "assessment-subject")?.value || DEFAULTS.subject,
      testLevel: qs(doc, "assessment-test-level")?.value || DEFAULTS.testLevel,
      subgroup: qs(doc, "assessment-subgroup")?.value || DEFAULTS.subgroup,
      fayStatus: qs(doc, "assessment-fay-status")?.value || DEFAULTS.fayStatus
    };
  }

  function chip(doc, label, variant = "info-chip") {
    const span = doc.createElement("span");
    span.className = `chip ${variant}`;
    span.textContent = label;
    return span;
  }

  // Task 5: determine per-point suppression status
  function pointStatus(point) {
    if (point.percentPassing == null && point.numberTested == null) return "suppressed";
    if (point.percentPassing == null && point.numberTested != null) return "partial";
    return "available";
  }

  function renderChips(doc, detail) {
    const row = qs(doc, "assessment-chip-row");
    if (!row) return;
    row.innerHTML = "";
    row.appendChild(chip(doc, detail.fayStatus || DEFAULTS.fayStatus));
    row.appendChild(chip(doc, detail.subgroup || DEFAULTS.subgroup));
    row.appendChild(chip(doc, detail.testLevel || DEFAULTS.testLevel));
    row.appendChild(chip(doc, "Review indicator"));
    if (detail.confidenceLabel) row.appendChild(chip(doc, `Confidence: ${detail.confidenceLabel}`));
    if (!detail.available) row.appendChild(chip(doc, "Not forecastable", "warn-chip"));

    // Task 5: count points where percentPassing is null (both suppressed and partial)
    const points = detail.trendPoints || [];
    const nullScoreCount = points.filter(p => p.percentPassing == null).length;
    if (nullScoreCount > 0) {
      row.appendChild(chip(doc, `${nullScoreCount} yr${nullScoreCount !== 1 ? "s" : ""} without usable score`, "warn-chip"));
    }
  }

  function renderKpis(doc, detail, horizon = {}) {
    applyFy2030Visibility(doc, horizon.includeFy2030 !== false);
    setText(doc, "assessment-latest", detail.latestPercentPassing == null ? "-" : `${formatPercent(detail.latestPercentPassing)} (${detail.latestYear || "-"})`);

    // Task 4: FY2026 with range below
    const fy2026El = qs(doc, "assessment-fy2026");
    if (fy2026El) {
      fy2026El.textContent = formatPercent(detail.forecast2026);
      const low = detail.forecast2026Low;
      const high = detail.forecast2026High;
      if (low != null && high != null && Number.isFinite(Number(low)) && Number.isFinite(Number(high))) {
        let rangeEl = fy2026El.nextElementSibling;
        if (!rangeEl || !rangeEl.classList.contains("assessment-kpi-range")) {
          rangeEl = doc.createElement("small");
          rangeEl.className = "assessment-kpi-range";
          fy2026El.parentNode.appendChild(rangeEl);
        }
        rangeEl.textContent = `range ${formatPercent(low)} to ${formatPercent(high)}`;
      } else {
        const existing = fy2026El.nextElementSibling;
        if (existing && existing.classList.contains("assessment-kpi-range")) {
          existing.remove();
        }
      }
    }

    setText(doc, "assessment-fy2030", formatPercent(detail.forecast2030));

    // Annual Trend with fitted year count context (uses fittedYears from API, not trend points)
    const slopeEl = qs(doc, "assessment-slope");
    if (slopeEl) {
      const slopeText = formatSigned(detail.slopePerYear);
      const fittedCount = fittedYearCount(detail);
      if (fittedCount >= 2) {
        slopeEl.textContent = `${slopeText} over ${fittedCount} yr${fittedCount !== 1 ? "s" : ""}`;
      } else {
        slopeEl.textContent = slopeText;
      }
    }

    setText(doc, "assessment-confidence", titleText(detail.confidenceLabel));
    setText(doc, "assessment-trend", titleText(detail.trendClassification));
  }

  function renderGovernanceBanner(doc, detail, horizon = {}) {
    // Task 3: persistent banner above KPI cards
    let banner = qs(doc, "assessment-governance-banner");
    if (!banner) return;
    const hasForecast = detail.forecast2026 != null || detail.forecast2030 != null;
    if (!hasForecast) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    banner.textContent = governanceText(detail.dampingWeight, horizon);
  }

  function renderNarrative(doc, detail, horizon = {}) {
    const target = qs(doc, "assessment-narrative");
    if (!target) return;
    target.innerHTML = "";
    const narrative = detail.narrative;
    const hasNarrative = Boolean(narrative);
    // Keep a shorter caveat line in the narrative panel (Task 3 requirement)
    const narrativeCaveat = horizon.includeFy2030 === false
      ? "Note: FY2026 carries the latest actual forward."
      : "Note: FY2026 carries the latest actual forward; FY2030 is illustrative.";
    const paragraphs = narrative
      ? [
          narrative.headline,
          narrative.summarySentence,
          narrative.evidenceSentence,
          narrative.caveatSentence,
          narrativeCaveat,
          narrative.recommendedReviewPrompt
        ]
      : [detail.unavailableReason || "No school narrative is available for this selection."];
    paragraphs.filter(Boolean).forEach((text, index) => {
      const p = doc.createElement("p");
      p.className = hasNarrative && index === 0 ? "assessment-narrative-headline" : "predictive-note";
      p.textContent = text;
      target.appendChild(p);
    });
  }

  function renderTrendTable(doc, detail) {
    const tbody = qs(doc, "assessment-points-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const points = detail.trendPoints || [];
    setText(doc, "assessment-point-count", `Rows: ${points.length}`);
    if (!points.length) {
      const tr = doc.createElement("tr");
      const td = doc.createElement("td");
      td.colSpan = 4;
      td.textContent = "No trend points available.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    points.forEach(point => {
      const tr = doc.createElement("tr");
      // Task 5: distinguish Suppressed / Partially suppressed / Available
      const status = pointStatus(point);
      let statusLabel;
      if (status === "suppressed") {
        statusLabel = "Suppressed";
      } else if (status === "partial") {
        statusLabel = "Partially suppressed";
      } else {
        statusLabel = "Available";
      }
      [
        safeText(point.fiscalYear),
        formatPercent(point.percentPassing),
        safeText(point.numberTested),
        statusLabel
      ].forEach(value => {
        const td = doc.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function renderFlags(doc, detail) {
    const target = qs(doc, "assessment-flags");
    if (!target) return;
    target.innerHTML = "";
    const flags = detail.qualityFlags || [];
    setText(doc, "assessment-flag-count", `Rows: ${flags.length}`);
    if (!flags.length) {
      const empty = doc.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No quality flags for this school.";
      target.appendChild(empty);
      return;
    }
    flags.forEach(flag => {
      const item = doc.createElement("div");
      item.className = "assessment-flag-item";
      const strong = doc.createElement("strong");
      strong.textContent = titleText(flag.flagType);
      const p = doc.createElement("p");
      p.textContent = safeText(flag.flagDetail);
      item.append(strong, p);
      target.appendChild(item);
    });
  }

  function ensureChartTooltip(doc, target) {
    let tooltip = target.querySelector(".assessment-chart-tooltip");
    if (tooltip) return tooltip;
    tooltip = doc.createElement("div");
    tooltip.className = "assessment-chart-tooltip";
    tooltip.hidden = true;
    tooltip.setAttribute("role", "tooltip");
    target.appendChild(tooltip);
    return tooltip;
  }

  function showChartTooltip(tooltip, text, x, y, width, height) {
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(8, Math.min(92, (x / width) * 100))}%`;
    tooltip.style.top = `${Math.max(10, Math.min(88, (y / height) * 100))}%`;
  }

  function hideChartTooltip(tooltip) {
    tooltip.hidden = true;
    tooltip.textContent = "";
  }

  function buildChartPoints(detail, options = {}) {
    const includeFy2030 = options.includeFy2030 !== false;
    const actuals = (detail.trendPoints || [])
      .filter(point => point.percentPassing != null)
      .map(point => ({ year: Number(point.fiscalYear), value: Number(point.percentPassing), kind: "actual" }));
    const forecasts = [
      detail.forecast2026 == null ? null : { year: 2026, value: Number(detail.forecast2026), kind: "forecast" },
      includeFy2030 && detail.forecast2030 != null ? { year: 2030, value: Number(detail.forecast2030), kind: "illustration" } : null
    ].filter(Boolean);
    return [...actuals, ...forecasts].filter(point => Number.isFinite(point.year) && Number.isFinite(point.value));
  }

  function linePath(points, xScale, yScale) {
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(point.year).toFixed(1)} ${yScale(point.value).toFixed(1)}`).join(" ");
  }

  function chartLayout() {
    const width = 720;
    const height = 312;
    const pad = { left: 48, right: 20, top: 18, bottom: 80 };
    return {
      width,
      height,
      pad,
      yearLabelY: height - 58,
      xAxisLabelY: height - 36,
      legendY: height - 14,
      legendX: pad.left
    };
  }

  function renderChart(doc, detail, horizon = {}) {
    const target = qs(doc, "assessment-chart");
    if (!target) return;
    target.innerHTML = "";
    const points = buildChartPoints(detail, horizon);
    if (!points.length) {
      target.textContent = "No numeric trend data available.";
      return;
    }
    const { width, height, pad, yearLabelY, xAxisLabelY, legendY, legendX } = chartLayout();
    const years = points.map(point => point.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const xDenom = Math.max(1, maxYear - minYear);
    const xScale = year => pad.left + ((year - minYear) / xDenom) * (width - pad.left - pad.right);
    const yScale = value => height - pad.bottom - (Math.max(0, Math.min(100, value)) / 100) * (height - pad.top - pad.bottom);
    const actualPoints = points.filter(point => point.kind === "actual");
    const forecastPoints = points.filter(point => point.kind === "forecast");
    const illustrationPoints = points.filter(point => point.kind === "illustration");
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Assessment trend and forecast line");
    const tooltip = ensureChartTooltip(doc, target);

    [0, 25, 50, 75, 100].forEach(value => {
      const y = yScale(value);
      const line = doc.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(pad.left));
      line.setAttribute("x2", String(width - pad.right));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("class", "assessment-chart-grid");
      svg.appendChild(line);
      const label = doc.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", "8");
      label.setAttribute("y", String(y + 4));
      label.setAttribute("class", "assessment-chart-label");
      label.textContent = `${value}%`;
      svg.appendChild(label);
    });

    // Task 1: uncertainty band when forecast2026Low/High are numeric
    const low = detail.forecast2026Low;
    const high = detail.forecast2026High;
    const hasBand = low != null && high != null && Number.isFinite(Number(low)) && Number.isFinite(Number(high));
    if (hasBand && actualPoints.length > 0) {
      const lastActual = actualPoints[actualPoints.length - 1];
      const x0 = xScale(lastActual.year);
      const y0 = yScale(lastActual.value);
      const x1 = xScale(2026);
      const yLow = yScale(Number(low));
      const yHigh = yScale(Number(high));
      // Filled quad: lastActual -> (x2026, high) -> (x2026, low) -> back
      const bandPoly = doc.createElementNS("http://www.w3.org/2000/svg", "polygon");
      bandPoly.setAttribute("points", `${x0.toFixed(1)},${y0.toFixed(1)} ${x1.toFixed(1)},${yHigh.toFixed(1)} ${x1.toFixed(1)},${yLow.toFixed(1)}`);
      bandPoly.setAttribute("class", "assessment-chart-band");
      const bandText = bandTooltipText(detail);
      bandPoly.setAttribute("tabindex", "0");
      bandPoly.setAttribute("role", "img");
      bandPoly.setAttribute("aria-label", bandText);
      bandPoly.setAttribute("data-tooltip", bandText);
      const bandTitle = doc.createElementNS("http://www.w3.org/2000/svg", "title");
      bandTitle.textContent = bandText;
      bandPoly.appendChild(bandTitle);
      bandPoly.addEventListener("mouseenter", () => showChartTooltip(tooltip, bandText, x1, (yLow + yHigh) / 2, width, height));
      bandPoly.addEventListener("focus", () => showChartTooltip(tooltip, bandText, x1, (yLow + yHigh) / 2, width, height));
      bandPoly.addEventListener("mouseleave", () => hideChartTooltip(tooltip));
      bandPoly.addEventListener("blur", () => hideChartTooltip(tooltip));
      svg.appendChild(bandPoly);
      // Dashed outline edges: lastActual to high, lastActual to low
      const edgeHigh = doc.createElementNS("http://www.w3.org/2000/svg", "line");
      edgeHigh.setAttribute("x1", x0.toFixed(1));
      edgeHigh.setAttribute("y1", y0.toFixed(1));
      edgeHigh.setAttribute("x2", x1.toFixed(1));
      edgeHigh.setAttribute("y2", yHigh.toFixed(1));
      edgeHigh.setAttribute("class", "assessment-chart-band-edge");
      svg.appendChild(edgeHigh);
      const edgeLow = doc.createElementNS("http://www.w3.org/2000/svg", "line");
      edgeLow.setAttribute("x1", x0.toFixed(1));
      edgeLow.setAttribute("y1", y0.toFixed(1));
      edgeLow.setAttribute("x2", x1.toFixed(1));
      edgeLow.setAttribute("y2", yLow.toFixed(1));
      edgeLow.setAttribute("class", "assessment-chart-band-edge");
      svg.appendChild(edgeLow);
    }

    if (actualPoints.length > 1) {
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", linePath(actualPoints, xScale, yScale));
      path.setAttribute("class", "assessment-chart-line actual");
      svg.appendChild(path);
    }
    // Dashed forecast line: last actual to 2026 forecast only (not through 2030)
    if (actualPoints.length && forecastPoints.length) {
      const bridge = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      bridge.setAttribute("d", linePath([actualPoints[actualPoints.length - 1], ...forecastPoints], xScale, yScale));
      bridge.setAttribute("class", "assessment-chart-line forecast");
      svg.appendChild(bridge);
    }

    // Sparse-dash illustration line: 2026 forecast (or last actual) -> 2030
    if (illustrationPoints.length) {
      const illusOrigin = forecastPoints.length
        ? forecastPoints[forecastPoints.length - 1]
        : actualPoints.length ? actualPoints[actualPoints.length - 1] : null;
      if (illusOrigin) {
        const illusPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        illusPath.setAttribute("d", linePath([illusOrigin, ...illustrationPoints], xScale, yScale));
        illusPath.setAttribute("class", "assessment-chart-line illustration");
        svg.appendChild(illusPath);
      }
    }

    points.forEach(point => {
      const pointX = xScale(point.year);
      const pointY = yScale(point.value);
      const tooltipText = chartTooltipText(point, detail);
      const circle = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(pointX));
      circle.setAttribute("cy", String(pointY));
      circle.setAttribute("r", point.kind === "forecast" || point.kind === "illustration" ? "5" : "4");
      circle.setAttribute("class", `assessment-chart-point ${point.kind}`);
      circle.setAttribute("tabindex", "0");
      circle.setAttribute("role", "img");
      circle.setAttribute("aria-label", tooltipText);
      circle.setAttribute("data-tooltip", tooltipText);
      const title = doc.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = tooltipText;
      circle.appendChild(title);
      circle.addEventListener("mouseenter", () => showChartTooltip(tooltip, tooltipText, pointX, pointY, width, height));
      circle.addEventListener("focus", () => showChartTooltip(tooltip, tooltipText, pointX, pointY, width, height));
      circle.addEventListener("mouseleave", () => hideChartTooltip(tooltip));
      circle.addEventListener("blur", () => hideChartTooltip(tooltip));
      svg.appendChild(circle);
      const label = doc.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(pointX));
      label.setAttribute("y", String(yearLabelY));
      label.setAttribute("class", "assessment-chart-year");
      label.textContent = String(point.year);
      svg.appendChild(label);
    });

    // Task 2: x-axis label "Fiscal year"
    const xAxisLabel = doc.createElementNS("http://www.w3.org/2000/svg", "text");
    xAxisLabel.setAttribute("x", String(Math.round((pad.left + width - pad.right) / 2)));
    xAxisLabel.setAttribute("y", String(xAxisLabelY));
    xAxisLabel.setAttribute("class", "assessment-chart-axis-label");
    xAxisLabel.textContent = "Fiscal year";
    svg.appendChild(xAxisLabel);

    // Legend row below the x-axis label.
    // "Actual" swatch: solid line + dot
    const legActualLine = doc.createElementNS("http://www.w3.org/2000/svg", "line");
    legActualLine.setAttribute("x1", String(legendX));
    legActualLine.setAttribute("y1", String(legendY));
    legActualLine.setAttribute("x2", String(legendX + 18));
    legActualLine.setAttribute("y2", String(legendY));
    legActualLine.setAttribute("class", "assessment-chart-line actual assessment-legend-line");
    svg.appendChild(legActualLine);
    const legActualDot = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
    legActualDot.setAttribute("cx", String(legendX + 9));
    legActualDot.setAttribute("cy", String(legendY));
    legActualDot.setAttribute("r", "3");
    legActualDot.setAttribute("class", "assessment-chart-point actual");
    svg.appendChild(legActualDot);
    const legActualText = doc.createElementNS("http://www.w3.org/2000/svg", "text");
    legActualText.setAttribute("x", String(legendX + 22));
    legActualText.setAttribute("y", String(legendY + 4));
    legActualText.setAttribute("class", "assessment-chart-legend-label");
    legActualText.textContent = "Actual";
    svg.appendChild(legActualText);

    // "Forecast" swatch: dashed line + open dot
    const legFcX = legendX + 80;
    const legFcLine = doc.createElementNS("http://www.w3.org/2000/svg", "line");
    legFcLine.setAttribute("x1", String(legFcX));
    legFcLine.setAttribute("y1", String(legendY));
    legFcLine.setAttribute("x2", String(legFcX + 18));
    legFcLine.setAttribute("y2", String(legendY));
    legFcLine.setAttribute("class", "assessment-chart-line forecast assessment-legend-line");
    svg.appendChild(legFcLine);
    const legFcDot = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
    legFcDot.setAttribute("cx", String(legFcX + 9));
    legFcDot.setAttribute("cy", String(legendY));
    legFcDot.setAttribute("r", "4");
    legFcDot.setAttribute("class", "assessment-chart-point forecast assessment-legend-open");
    svg.appendChild(legFcDot);
    const legFcText = doc.createElementNS("http://www.w3.org/2000/svg", "text");
    legFcText.setAttribute("x", String(legFcX + 22));
    legFcText.setAttribute("y", String(legendY + 4));
    legFcText.setAttribute("class", "assessment-chart-legend-label");
    legFcText.textContent = "Forecast";
    svg.appendChild(legFcText);

    // "Likely range" swatch: small filled rect (only when band is present)
    const legRangeX = legFcX + 96;
    if (hasBand) {
      const legRangeRect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
      legRangeRect.setAttribute("x", String(legRangeX));
      legRangeRect.setAttribute("y", String(legendY - 5));
      legRangeRect.setAttribute("width", "18");
      legRangeRect.setAttribute("height", "10");
      legRangeRect.setAttribute("class", "assessment-chart-band assessment-legend-band");
      svg.appendChild(legRangeRect);
      const legRangeText = doc.createElementNS("http://www.w3.org/2000/svg", "text");
      legRangeText.setAttribute("x", String(legRangeX + 22));
      legRangeText.setAttribute("y", String(legendY + 4));
      legRangeText.setAttribute("class", "assessment-chart-legend-label");
      legRangeText.textContent = "Likely range";
      svg.appendChild(legRangeText);
    }

    // "If-trend-continued" swatch: sparse-dash line + hollow dot (only when 2030 illustration present)
    if (illustrationPoints.length) {
      const legIllusX = legRangeX + (hasBand ? 104 : 0);
      const legIllusLine = doc.createElementNS("http://www.w3.org/2000/svg", "line");
      legIllusLine.setAttribute("x1", String(legIllusX));
      legIllusLine.setAttribute("y1", String(legendY));
      legIllusLine.setAttribute("x2", String(legIllusX + 18));
      legIllusLine.setAttribute("y2", String(legendY));
      legIllusLine.setAttribute("class", "assessment-chart-line illustration assessment-legend-line");
      svg.appendChild(legIllusLine);
      const legIllusDot = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
      legIllusDot.setAttribute("cx", String(legIllusX + 9));
      legIllusDot.setAttribute("cy", String(legendY));
      legIllusDot.setAttribute("r", "4");
      legIllusDot.setAttribute("class", "assessment-chart-point illustration");
      svg.appendChild(legIllusDot);
      const legIllusText = doc.createElementNS("http://www.w3.org/2000/svg", "text");
      legIllusText.setAttribute("x", String(legIllusX + 22));
      legIllusText.setAttribute("y", String(legendY + 4));
      legIllusText.setAttribute("class", "assessment-chart-legend-label");
      legIllusText.textContent = "If-trend-continued";
      svg.appendChild(legIllusText);
    }

    target.appendChild(svg);
  }

  function renderDetail(doc, detail) {
    latestDetail = detail;
    const horizon = readHorizon(doc);
    const empty = qs(doc, "assessment-empty");
    if (empty) empty.hidden = detail.available || (detail.trendPoints || []).length > 0;
    setText(doc, "assessment-school-title", detail.schoolName ? `${detail.schoolName} (${detail.schoolCode})` : `School ${detail.schoolCode || "-"}`);
    setText(doc, "assessment-school-meta", [detail.districtName, detail.county, detail.titleOneYesNo ? `Title I: ${detail.titleOneYesNo}` : null].filter(Boolean).join(" | ") || "School context unavailable.");
    renderGovernanceBanner(doc, detail, horizon);
    renderChips(doc, detail);
    renderKpis(doc, detail, horizon);
    renderNarrative(doc, detail, horizon);
    renderTrendTable(doc, detail);
    renderFlags(doc, detail);
    renderChart(doc, detail, horizon);
  }

  async function loadOptions(doc, root) {
    if (!root.HeliosApi?.fetchJson) return;
    const options = await root.HeliosApi.fetchJson("/assessment-predictions/options");
    latestOptions = options;
    const selectedSchoolCode = setSchoolOptions(doc, options.schools, options.defaultSchoolCode);
    setOptions(doc, "assessment-subject", options.subjects, DEFAULTS.subject);
    setOptions(doc, "assessment-test-level", options.testLevels, DEFAULTS.testLevel);
    setOptions(doc, "assessment-subgroup", options.subgroups, DEFAULTS.subgroup);
    setOptions(doc, "assessment-fay-status", options.fayStatuses, DEFAULTS.fayStatus);
    if (selectedSchoolCode) {
      await loadSchool(doc, root);
    }
  }

  async function loadSchool(doc, root, options = {}) {
    clearError(doc);
    if (options.clearSnapNote !== false) {
      clearAdvancedSnapNote(doc);
    }
    const filters = readFilters(doc);
    if (!/^\d+$/.test(filters.schoolCode)) {
      showError(doc, "Enter a numeric school code before loading a trend indicator.");
      return;
    }
    const detail = await root.HeliosApi.fetchJson(`/assessment-predictions/school${buildQuery(filters)}`);
    renderDetail(doc, detail);
    if (currentView === "advanced") {
      await loadAdvanced(doc, root);
    }
  }

  const ADVANCED_DRIVER_LABELS = {
    pct_low_income: "Low-income enrollment",
    pct_swd: "Students with disabilities",
    pct_el: "English learners",
    pct_hispanic: "Hispanic/Latino enrollment",
    pct_white: "White enrollment",
    pct_black: "Black enrollment",
    log_enrollment: "School size"
  };
  const ADVANCED_CLASS_LABELS = {
    outperforming: "Outperforming its context",
    underperforming: "Underperforming its context",
    as_expected: "About as expected"
  };
  const ADVANCED_GAP_LABELS = {
    low_income_vs_all: "Low-income vs all students",
    swd_vs_all: "Students with disabilities vs all",
    el_vs_all: "English learners vs all",
    hispanic_vs_white: "Hispanic/Latino vs White",
    black_vs_white: "Black vs White"
  };
  const ADVANCED_GAP_TREND_LABELS = {
    narrowing: "narrowing",
    widening: "widening",
    stable: "steady",
    insufficient_history: "limited history"
  };

  let currentView = "trend";
  let latestOptions = null;
  let latestDetail = null;

  function formatPoints(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    return Number(value).toFixed(digits);
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundTo(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function percentileOrdinal(value) {
    const rounded = Math.round(Number(value));
    const mod100 = rounded % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${rounded}th`;
    const mod10 = rounded % 10;
    if (mod10 === 1) return `${rounded}st`;
    if (mod10 === 2) return `${rounded}nd`;
    if (mod10 === 3) return `${rounded}rd`;
    return `${rounded}th`;
  }

  function advancedResidualVisual(residual) {
    const value = finiteNumber(residual);
    if (value === null) return null;
    const widthPct = clampNumber((Math.abs(value) / ADVANCED_RESIDUAL_HALF_SCALE) * 50, 0, 50);
    return {
      direction: value >= 0 ? "above" : "below",
      label: `${value >= 0 ? "+" : ""}${formatPoints(value)}`,
      widthPct: roundTo(widthPct)
    };
  }

  function advancedPercentileVisual(percentile) {
    const value = finiteNumber(percentile);
    if (value === null) return null;
    const positionPct = roundTo(clampNumber(value, 0, 100));
    const rounded = Math.round(positionPct);
    return {
      positionPct,
      rounded,
      label: `Higher than about ${rounded}% of schools serving similar students (${percentileOrdinal(rounded)} percentile).`
    };
  }

  function advancedDriverLabel(name) {
    return ADVANCED_DRIVER_LABELS[name] || titleText(name);
  }

  function advancedClassLabel(classification) {
    return ADVANCED_CLASS_LABELS[classification] || titleText(classification);
  }

  function advancedClassVariant(classification) {
    if (classification === "outperforming") return "good-chip";
    if (classification === "underperforming") return "warn-chip";
    return "info-chip";
  }

  function advancedGapLabel(label) {
    return ADVANCED_GAP_LABELS[label] || titleText(label);
  }

  function advancedGapTrendLabel(trendClass) {
    return ADVANCED_GAP_TREND_LABELS[trendClass] || titleText(trendClass);
  }

  function describeDriver(driver) {
    if (!driver || driver.contribution === null || driver.contribution === undefined) return "";
    // Neutral signed format: this school's level of the factor contributes +/- pts to its
    // expected score. Avoids the misread that "having students with disabilities raises the
    // expectation" — it is the school's (often below-average) share that moves the expectation.
    const contribution = Number(driver.contribution);
    const sign = contribution >= 0 ? "+" : "-";
    return `${advancedDriverLabel(driver.name)}: ${sign}${formatPoints(Math.abs(contribution))} pts`;
  }

  function renderAdvancedExpectedValue(doc, advanced) {
    const body = qs(doc, "assessment-ev-body");
    const empty = qs(doc, "assessment-ev-empty");
    const chip = qs(doc, "assessment-ev-chip");
    const metricsEl = qs(doc, "assessment-ev-metrics");
    if (body) body.replaceChildren();
    const ev = advanced && advanced.expectedValue;
    if (!ev) {
      if (empty) empty.hidden = false;
      if (chip) { chip.textContent = "Not available"; chip.className = "chip info-chip"; }
      if (metricsEl) metricsEl.textContent = "";
      return;
    }
    if (empty) empty.hidden = true;
    if (chip) {
      chip.textContent = advancedClassLabel(ev.classification);
      chip.className = `chip ${advancedClassVariant(ev.classification)}`;
    }
    if (body) {
      const stats = doc.createElement("div");
      stats.className = "assessment-ev-stats";
      const stat = (label, value) => {
        const wrap = doc.createElement("div");
        wrap.className = "assessment-ev-stat";
        const l = doc.createElement("span");
        l.textContent = label;
        const v = doc.createElement("strong");
        v.textContent = value;
        wrap.append(l, v);
        return wrap;
      };
      const residual = Number(ev.residual);
      stats.append(
        stat("Actual", `${formatPoints(ev.actual)}%`),
        stat("Expected", `${formatPoints(ev.expected)}%`),
        stat("Difference", `${residual >= 0 ? "+" : ""}${formatPoints(residual)} pts`)
      );
      body.append(stats);

      const residualVisual = advancedResidualVisual(ev.residual);
      const percentileVisual = advancedPercentileVisual(ev.percentile);
      if (residualVisual || percentileVisual) {
        const visuals = doc.createElement("div");
        visuals.className = "assessment-ev-visuals";

        if (residualVisual) {
          const diverging = doc.createElement("div");
          diverging.className = "assessment-ev-diverging";
          diverging.setAttribute("aria-label", `Difference from expected: ${residualVisual.label} points`);

          const track = doc.createElement("div");
          track.className = "assessment-ev-diverging-track";

          const base = doc.createElement("div");
          base.className = "assessment-ev-diverging-base";
          const center = doc.createElement("div");
          center.className = "assessment-ev-diverging-center";
          const fill = doc.createElement("div");
          fill.className = `assessment-ev-diverging-fill ${residualVisual.direction}`;
          fill.style.width = `${residualVisual.widthPct}%`;
          if (residualVisual.direction === "above") {
            fill.style.left = "50%";
          } else {
            fill.style.right = "50%";
          }
          const value = doc.createElement("strong");
          value.className = `assessment-ev-diverging-value ${residualVisual.direction}`;
          // Center the callout over the bar tip, but clamp it inside the track so large
          // residuals (which cap the bar at 50% width) never push the number off the edge.
          const tip = residualVisual.direction === "above"
            ? `calc(50% + ${residualVisual.widthPct}%)`
            : `calc(50% - ${residualVisual.widthPct}%)`;
          value.style.left = `clamp(26px, ${tip}, calc(100% - 26px))`;
          value.textContent = residualVisual.label;
          track.append(base, center, fill, value);

          const axis = doc.createElement("div");
          axis.className = "assessment-ev-diverging-axis subtle";
          axis.textContent = "← below expected · expected · above expected →";

          diverging.append(track, axis);
          visuals.append(diverging);
        }

        if (percentileVisual) {
          const percentile = doc.createElement("div");
          percentile.className = "assessment-ev-percentile";
          percentile.setAttribute("aria-label", percentileVisual.label);

          const strip = doc.createElement("div");
          strip.className = "assessment-ev-percentile-strip";
          const fill = doc.createElement("div");
          fill.className = "assessment-ev-percentile-fill";
          fill.style.width = `${percentileVisual.positionPct}%`;
          const marker = doc.createElement("div");
          marker.className = "assessment-ev-percentile-marker";
          // Clamp inside the strip so the 0th/100th-percentile marker doesn't bleed past the edge.
          marker.style.left = `clamp(2px, ${percentileVisual.positionPct}%, calc(100% - 2px))`;
          strip.append(fill, marker);

          const caption = doc.createElement("p");
          caption.className = "assessment-ev-percentile-caption subtle";
          caption.textContent = percentileVisual.label;

          percentile.append(strip, caption);
          visuals.append(percentile);
        }

        body.append(visuals);
      }

      const drivers = Array.isArray(ev.drivers) ? ev.drivers : [];
      if (drivers.length) {
        const title = doc.createElement("p");
        title.className = "assessment-ev-drivers-title subtle";
        title.textContent = "What shapes this school's expected score (these factors overlap, so read them together):";
        body.append(title);
        const list = doc.createElement("ul");
        list.className = "assessment-ev-drivers";
        drivers.forEach(driver => {
          const item = doc.createElement("li");
          item.textContent = describeDriver(driver);
          list.append(item);
        });
        body.append(list);
      }
    }
    if (metricsEl) {
      const metrics = advanced && advanced.modelMetrics;
      metricsEl.textContent = metrics && metrics.modelRmse !== null && metrics.modelRmse !== undefined
        ? `Tested on ${metrics.evaluationRowCount} schools it had not seen: about ${formatPoints(metrics.improvementPct)}% more accurate than guessing the average, usually within about ${formatPoints(metrics.modelRmse)} points.`
        : "";
    }
  }

  function renderAdvancedGaps(doc, advanced) {
    const body = qs(doc, "assessment-gaps-body");
    const empty = qs(doc, "assessment-gaps-empty");
    const count = qs(doc, "assessment-gaps-count");
    if (body) body.replaceChildren();
    const gaps = advanced && Array.isArray(advanced.equityGaps) ? advanced.equityGaps : [];
    const usable = gaps.filter(gap => gap.gap !== null && gap.gap !== undefined);
    if (count) {
      const hidden = gaps.length - usable.length;
      count.textContent = hidden > 0 ? `Shown: ${usable.length} (+${hidden} limited)` : `Shown: ${usable.length}`;
    }
    if (!usable.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    const maxGap = Math.max(10, ...usable.map(gap => Math.abs(Number(gap.gap) || 0)));
    usable.forEach(gap => {
      const gapNum = Number(gap.gap);
      const item = doc.createElement("div");
      item.className = "assessment-gap-item";

      const head = doc.createElement("div");
      head.className = "assessment-gap-head";
      const label = doc.createElement("span");
      label.textContent = advancedGapLabel(gap.gapLabel);
      const value = doc.createElement("strong");
      // gap = reference - focal; positive means the focal group trails. Use plain
      // "behind/ahead" wording so there is no +/- sign that conflicts with the API field.
      const standing = gapNum > 0 ? "behind" : gapNum < 0 ? "ahead" : "even";
      value.textContent = `${formatPoints(Math.abs(gapNum))} pts ${standing}`;
      head.append(label, value);

      const track = doc.createElement("div");
      track.className = "assessment-gap-track";
      const bar = doc.createElement("div");
      bar.className = `assessment-gap-bar ${gapNum > 0 ? "behind" : "ahead"}`;
      bar.style.width = `${Math.min(100, (Math.abs(gapNum) / maxGap) * 100)}%`;
      track.append(bar);

      const meta = doc.createElement("p");
      meta.className = "subtle assessment-gap-meta";
      meta.textContent = `${formatPoints(gap.focalPercentPassing)}% vs ${formatPoints(gap.referencePercentPassing)}% reference. Gap ${advancedGapTrendLabel(gap.gapTrendClass)}.`;

      item.append(head, track, meta);
      body.append(item);
    });
  }

  function renderAdvanced(doc, advanced) {
    renderAdvancedExpectedValue(doc, advanced);
    renderAdvancedGaps(doc, advanced);
  }

  function applyViewVisibility(doc) {
    const trendView = qs(doc, "assessment-trend-view");
    const advancedView = qs(doc, "assessment-advanced-view");
    if (trendView) trendView.hidden = currentView !== "trend";
    if (advancedView) advancedView.hidden = currentView !== "advanced";
    const trendBtn = qs(doc, "assessment-view-trend");
    const advancedBtn = qs(doc, "assessment-view-advanced");
    if (trendBtn) {
      trendBtn.classList.toggle("active", currentView === "trend");
      trendBtn.setAttribute("aria-selected", String(currentView === "trend"));
    }
    if (advancedBtn) {
      advancedBtn.classList.toggle("active", currentView === "advanced");
      advancedBtn.setAttribute("aria-selected", String(currentView === "advanced"));
    }
  }

  function advancedNeedsSnap(advanced) {
    return Boolean(advanced && (advanced.available === false || advanced.expectedValueAvailable === false));
  }

  function advancedSnapTargetSchoolCode(options, subject, currentSchoolCode, advanced) {
    if (!advancedNeedsSnap(advanced)) return "";
    const snapCode = defaultAdvancedSchoolCodeFromOptions(options, subject);
    const currentCode = String(currentSchoolCode == null ? "" : currentSchoolCode).trim();
    return snapCode && snapCode !== currentCode ? snapCode : "";
  }

  async function loadAdvanced(doc, root) {
    if (!root.HeliosApi?.fetchJson) return;
    const filters = readFilters(doc);
    if (!/^\d+$/.test(filters.schoolCode)) return;
    const advanced = await root.HeliosApi.fetchJson(
      `/assessment-predictions/advanced${buildQuery({ schoolCode: filters.schoolCode, subject: filters.subject })}`
    );
    renderAdvanced(doc, advanced);
    return advanced;
  }

  async function setView(doc, root, view) {
    currentView = view === "advanced" ? "advanced" : "trend";
    applyViewVisibility(doc);
    if (currentView === "advanced") {
      const filters = readFilters(doc);
      const advanced = await loadAdvanced(doc, root);
      const snapCode = advancedSnapTargetSchoolCode(latestOptions, filters.subject, filters.schoolCode, advanced);
      if (snapCode && setSchoolInputFromOptions(doc, latestOptions, snapCode)) {
        await loadSchool(doc, root, { clearSnapNote: false });
        showAdvancedSnapNote(doc, advancedSnapNoteText(latestOptions, filters.schoolCode, snapCode, filters.subject));
        return;
      }
      clearAdvancedSnapNote(doc);
      return;
    }
    clearAdvancedSnapNote(doc);
  }

  function bootstrap(doc, root) {
    const loadButton = qs(doc, "assessment-load");
    if (loadButton) {
      loadButton.addEventListener("click", () => {
        loadSchool(doc, root).catch(error => showError(doc, error.message));
      });
    }
    [
      "assessment-subject",
      "assessment-test-level",
      "assessment-subgroup",
      "assessment-fay-status"
    ].forEach(id => {
      const control = qs(doc, id);
      if (!control) return;
      control.addEventListener("change", () => {
        loadSchool(doc, root).catch(error => showError(doc, error.message));
      });
    });
    const schoolInput = qs(doc, "assessment-school");
    if (schoolInput) {
      schoolInput.addEventListener("change", () => {
        loadSchool(doc, root).catch(error => showError(doc, error.message));
      });
      schoolInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          loadSchool(doc, root).catch(error => showError(doc, error.message));
        }
      });
    }
    const trendViewBtn = qs(doc, "assessment-view-trend");
    if (trendViewBtn) {
      trendViewBtn.addEventListener("click", () => {
        setView(doc, root, "trend").catch(error => showError(doc, error.message));
      });
    }
    const advancedViewBtn = qs(doc, "assessment-view-advanced");
    if (advancedViewBtn) {
      advancedViewBtn.addEventListener("click", () => {
        setView(doc, root, "advanced").catch(error => showError(doc, error.message));
      });
    }
    const advancedSnapDismiss = qs(doc, "assessment-advanced-snap-dismiss");
    if (advancedSnapDismiss) {
      advancedSnapDismiss.addEventListener("click", () => clearAdvancedSnapNote(doc));
    }
    const horizonToggle = qs(doc, "assessment-show-fy2030");
    if (horizonToggle) {
      horizonToggle.addEventListener("change", () => {
        if (latestDetail) {
          renderDetail(doc, latestDetail);
        }
      });
    }

    loadOptions(doc, root).catch(error => showError(doc, error.message));
  }

  return {
    advancedClassLabel,
    advancedClassVariant,
    advancedDriverLabel,
    advancedGapLabel,
    advancedGapTrendLabel,
    advancedPercentileVisual,
    advancedResidualVisual,
    advancedSnapNoteText,
    advancedSnapTargetSchoolCode,
    bandTooltipText,
    bootstrap,
    buildChartPoints,
    buildQuery,
    chartLayout,
    chartTooltipText,
    defaultSchoolCodeFromOptions,
    defaultAdvancedSchoolCodeFromOptions,
    describeDriver,
    fittedYearCount,
    formatPercent,
    formatPoints,
    formatSigned,
    governanceText,
    loadAdvanced,
    pointStatus,
    readFilters,
    readHorizon,
    renderAdvanced,
    renderDetail,
    schoolCodeFromInput,
    schoolOptionLabel,
    setSchoolOptions,
    setView
  };
});

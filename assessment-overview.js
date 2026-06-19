(function attachAssessmentOverview(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (!root) return;
  root.HeliosAssessmentOverview = Object.freeze(api);
  if (!root.document) return;
  const start = () => api.bootstrap(root.document, root);
  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : null, function buildAssessmentOverview() {
  const DEFAULTS = Object.freeze({
    county: "All Counties",
    subject: "Mathematics",
    testLevel: "All Assessments",
    subgroup: "All Students",
    fayStatus: "FAY"
  });
  const SELECTED_LIMIT = 10;
  const SVG_NS = "http://www.w3.org/2000/svg";

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

  function formatPercentile(value) {
    if (value == null || value === "") return "-";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "-";
    const rounded = Math.round(Math.max(0, Math.min(100, numeric)));
    const mod100 = rounded % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${rounded}th`;
    const mod10 = rounded % 10;
    if (mod10 === 1) return `${rounded}st`;
    if (mod10 === 2) return `${rounded}nd`;
    if (mod10 === 3) return `${rounded}rd`;
    return `${rounded}th`;
  }

  function buildQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      const text = Array.isArray(value)
        ? value.join(",")
        : String(value == null ? "" : value).trim();
      if (text.length) search.set(key, text);
    });
    const query = search.toString();
    return query ? `?${query}` : "";
  }

  function schoolOptionLabel(school) {
    const code = String(school?.schoolCode == null ? "" : school.schoolCode).trim();
    const name = String(school?.schoolName == null ? "" : school.schoolName).trim();
    const county = String(school?.county == null ? "" : school.county).trim();
    const district = String(school?.districtName == null ? "" : school.districtName).trim();
    const base = name ? `${name} (${code || "-"})` : code ? `School ${code}` : "Unknown school";
    const context = [county, district].filter(Boolean).join(" | ");
    return context ? `${base} | ${context}` : base;
  }

  function schoolCodeFromInput(value) {
    const text = String(value == null ? "" : value).trim();
    if (/^\d+$/.test(text)) return text;
    const parenMatch = text.match(/\((\d+)\)/);
    if (parenMatch) return parenMatch[1];
    const anyCode = text.match(/\b\d{3,}\b/);
    return anyCode ? anyCode[0] : "";
  }

  function readFilters(doc) {
    return {
      county: qs(doc, "overview-county")?.value || DEFAULTS.county,
      subject: qs(doc, "overview-subject")?.value || DEFAULTS.subject,
      testLevel: qs(doc, "overview-test-level")?.value || DEFAULTS.testLevel,
      subgroup: qs(doc, "overview-subgroup")?.value || DEFAULTS.subgroup,
      fayStatus: qs(doc, "overview-fay-status")?.value || DEFAULTS.fayStatus
    };
  }

  function setText(doc, id, value) {
    const el = qs(doc, id);
    if (el) el.textContent = value;
  }

  function readHorizon(doc) {
    const toggle = qs(doc, "overview-show-fy2030");
    return { includeFy2030: toggle ? toggle.checked !== false : true };
  }

  function applyFy2030Visibility(doc, includeFy2030) {
    if (!doc.querySelectorAll) return;
    doc.querySelectorAll("[data-fy2030-visibility]").forEach(node => {
      node.hidden = !includeFy2030;
    });
  }

  function showError(doc, message) {
    const el = qs(doc, "overview-api-error");
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
  }

  function clearError(doc) {
    const el = qs(doc, "overview-api-error");
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
  }

  function setOptions(doc, id, values, preferredValue) {
    const select = qs(doc, id);
    if (!select) return "";
    const ordered = Array.from(new Set([preferredValue, ...(values || [])].filter(Boolean)));
    select.innerHTML = "";
    ordered.forEach(value => {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = ordered.includes(preferredValue) ? preferredValue : ordered[0] || "";
    select.disabled = ordered.length <= 1 && id !== "overview-county";
    return select.value;
  }

  function setSchoolOptions(doc, state, schools) {
    const datalist = qs(doc, "overview-school-list");
    if (!datalist) return;
    const normalized = (schools || [])
      .map(school => ({
        schoolCode: String(school?.schoolCode == null ? "" : school.schoolCode).trim(),
        schoolName: school?.schoolName || "",
        districtName: school?.districtName || "",
        county: school?.county || ""
      }))
      .filter(school => /^\d+$/.test(school.schoolCode));
    state.schoolByCode = new Map(normalized.map(school => [school.schoolCode, school]));
    state.selectedCodes = state.selectedCodes.filter(code => state.schoolByCode.has(code));

    datalist.innerHTML = "";
    normalized.forEach(school => {
      const option = doc.createElement("option");
      option.value = schoolOptionLabel(school);
      option.setAttribute("data-school-code", school.schoolCode);
      datalist.appendChild(option);
    });
    renderSelectedSchools(doc, state);
  }

  function addSelectedSchool(doc, state) {
    const input = qs(doc, "overview-school-search");
    const code = schoolCodeFromInput(input?.value);
    if (!code || !state.schoolByCode.has(code) || state.selectedCodes.includes(code)) {
      if (input) input.value = "";
      return false;
    }
    if (state.selectedCodes.length >= SELECTED_LIMIT) {
      if (input) input.value = "";
      return false;
    }
    state.selectedCodes.push(code);
    if (input) input.value = "";
    renderSelectedSchools(doc, state);
    return true;
  }

  function removeSelectedSchool(doc, state, code) {
    state.selectedCodes = state.selectedCodes.filter(item => item !== code);
    renderSelectedSchools(doc, state);
  }

  function renderSelectedSchools(doc, state) {
    const target = qs(doc, "overview-selected-schools");
    if (!target) return;
    target.innerHTML = "";
    if (!state.selectedCodes.length) {
      const span = doc.createElement("span");
      span.className = "chip info-chip";
      span.textContent = `None selected (max ${SELECTED_LIMIT})`;
      target.appendChild(span);
      return;
    }
    state.selectedCodes.forEach(code => {
      const school = state.schoolByCode.get(code);
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "chip assessment-selected-chip";
      button.setAttribute("data-school-code", code);
      button.textContent = school ? `${school.schoolName || "School"} (${code}) x` : `${code} x`;
      button.addEventListener("click", () => removeSelectedSchool(doc, state, code));
      target.appendChild(button);
    });
  }

  function aggregateStatusText(weighted, coverage) {
    if (!weighted) return "-";
    if (weighted.weightingStatus === "weighted_by_latest_number_tested") {
      return `${safeText(weighted.weightedSchoolCount)} of ${safeText(weighted.schoolCount)} schools have tested-student counts for weighting`;
    }
    return `Unweighted fallback: tested-student counts unavailable for ${safeText(coverage?.schoolCount)} schools`;
  }

  function contextText(payload) {
    return [
      payload?.county || DEFAULTS.county,
      payload?.subject || DEFAULTS.subject,
      payload?.testLevel || DEFAULTS.testLevel,
      payload?.subgroup || DEFAULTS.subgroup,
      payload?.fayStatus || DEFAULTS.fayStatus
    ].join(" | ");
  }

  function buildOverviewRowValues(row, includeConfidence = false) {
    const school = row?.schoolName
      ? `${row.schoolName} (${safeText(row.schoolCode)})`
      : `School ${safeText(row?.schoolCode)}`;
    const latest = row?.latestPercentPassing == null
      ? "-"
      : `${formatPercent(row.latestPercentPassing)} (${safeText(row.latestYear)})`;
    const values = [
      school,
      safeText(row?.county),
      latest,
      formatPercent(row?.forecast2026),
      formatPercent(row?.forecast2030),
      formatSigned(row?.movementPoints)
    ];
    values.push(includeConfidence ? titleText(row?.confidenceLabel) : safeText(row?.latestNumberTested));
    return values;
  }

  function buildAdvancedRowValues(row) {
    const school = row?.schoolName
      ? `${row.schoolName} (${safeText(row.schoolCode)})`
      : `School ${safeText(row?.schoolCode)}`;
    return [
      school,
      safeText(row?.county),
      safeText(row?.subject),
      formatPercent(row?.actual),
      formatPercent(row?.expected),
      formatSigned(row?.residual),
      formatPercentile(row?.percentile),
      titleText(row?.classification),
      safeText(row?.numberTested)
    ];
  }

  function renderRows(doc, tbodyId, countId, rows, options = {}) {
    const tbody = qs(doc, tbodyId);
    if (!tbody) return;
    const safeRows = rows || [];
    const includeFy2030 = options.includeFy2030 !== false;
    tbody.innerHTML = "";
    setText(doc, countId, `Rows: ${safeRows.length}`);
    if (!safeRows.length) {
      const tr = doc.createElement("tr");
      const td = doc.createElement("td");
      td.colSpan = includeFy2030 ? 7 : 5;
      td.textContent = options.emptyText || "No schools matched the selected filters.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    safeRows.forEach(row => {
      const tr = doc.createElement("tr");
      buildOverviewRowValues(row, options.includeConfidence).forEach((value, index) => {
        const td = doc.createElement("td");
        td.textContent = value;
        if (index === 4 || index === 5) {
          td.setAttribute("data-fy2030-visibility", "");
          td.hidden = !includeFy2030;
        }
        if (index === 5) {
          const numeric = Number(row?.movementPoints);
          td.className = numeric >= 0 ? "assessment-movement-positive" : "assessment-movement-negative";
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function renderAdvancedRows(doc, tbodyId, countId, rows, options = {}) {
    const tbody = qs(doc, tbodyId);
    if (!tbody) return;
    const safeRows = rows || [];
    tbody.innerHTML = "";
    setText(doc, countId, `Rows: ${safeRows.length}`);
    if (!safeRows.length) {
      const tr = doc.createElement("tr");
      const td = doc.createElement("td");
      td.colSpan = 9;
      td.textContent = options.emptyText || "No advanced expected-vs-actual rows matched the selected filters.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    safeRows.forEach(row => {
      const tr = doc.createElement("tr");
      buildAdvancedRowValues(row).forEach((value, index) => {
        const td = doc.createElement("td");
        td.textContent = value;
        if (index === 5) {
          const numeric = Number(row?.residual);
          td.className = numeric >= 0 ? "assessment-movement-positive" : "assessment-movement-negative";
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
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

  function linePath(points, xScale, yScale) {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(point.year).toFixed(1)} ${yScale(point.value).toFixed(1)}`)
      .join(" ");
  }

  function trendChartLayout() {
    const width = 720;
    const height = 312;
    const pad = { left: 48, right: 20, top: 18, bottom: 80 };
    return {
      width,
      height,
      pad,
      yearLabelY: height - 58,
      xAxisLabelY: height - 36,
      legendY: height - 14
    };
  }

  function buildTrendChartPoints(payload, options = {}) {
    const includeFy2030 = options.includeFy2030 !== false;
    const points = (payload && payload.trend && Array.isArray(payload.trend.points)) ? payload.trend.points : [];
    const toSeries = key => points
      .filter(point => includeFy2030 || point.kind !== "illustration")
      .map(point => ({
        year: point.fiscalYear == null ? NaN : Number(point.fiscalYear),
        value: point[key] == null ? NaN : Number(point[key]),
        kind: point.kind || "actual"
      }))
      .filter(point => Number.isFinite(point.year) && Number.isFinite(point.value));
    return { weighted: toSeries("weighted"), median: toSeries("median") };
  }

  function trendTooltipText(point, series) {
    const label = series === "median" ? "Median school" : "Weighted aggregate";
    const value = formatPercent(point.value);
    if (point.kind === "forecast") {
      return `${label} FY${point.year} indicator: ${value}. Carries the latest actual forward (won the FY2025 backtest).`;
    }
    if (point.kind === "illustration") {
      return `${label} FY${point.year} if-trend-continues: ${value}. Illustrative extrapolation, not a decision-ready forecast.`;
    }
    const basis = series === "median" ? "each school one vote" : "weighted by students tested";
    return `${label} FY${point.year}: ${value} (${basis}).`;
  }

  function trendCoverageText(payload, options = {}) {
    const includeFy2030 = options.includeFy2030 !== false;
    const trend = payload && payload.trend;
    if (!trend || !Array.isArray(trend.points) || !trend.points.length) {
      return "No trend data for the selected filters.";
    }
    const actualYears = trend.points.filter(point => point.kind === "actual").map(point => point.fiscalYear);
    const range = actualYears.length
      ? `FY${Math.min(...actualYears)}-FY${Math.max(...actualYears)} actuals`
      : "No actual years";
    const weighted = trend.weightingStatus === "weighted_by_number_tested";
    const tail = weighted
      ? "Each actual year is weighted by that year's tested-student counts."
      : "Tested-student counts unavailable, so this shows the simple school average.";
    const forecastPhrase = includeFy2030
      ? "plus the FY2026 indicator and FY2030 illustration"
      : "plus the FY2026 indicator";
    return `${range}, ${forecastPhrase}. ${tail}`;
  }

  function drawTrendSeries(doc, svg, points, seriesName, xScale, yScale, tooltip, width, height) {
    if (!points.length) return;
    const suffix = seriesName === "median" ? " median" : "";
    const actualPoints = points.filter(point => point.kind === "actual");
    const forecastPoints = points.filter(point => point.kind === "forecast");
    const illustrationPoints = points.filter(point => point.kind === "illustration");

    if (actualPoints.length > 1) {
      const path = doc.createElementNS(SVG_NS, "path");
      path.setAttribute("d", linePath(actualPoints, xScale, yScale));
      path.setAttribute("class", `assessment-chart-line actual${suffix}`);
      svg.appendChild(path);
    }
    if (actualPoints.length && forecastPoints.length) {
      const bridge = doc.createElementNS(SVG_NS, "path");
      bridge.setAttribute("d", linePath([actualPoints[actualPoints.length - 1], ...forecastPoints], xScale, yScale));
      bridge.setAttribute("class", `assessment-chart-line forecast${suffix}`);
      svg.appendChild(bridge);
    }
    if (illustrationPoints.length) {
      const origin = forecastPoints.length
        ? forecastPoints[forecastPoints.length - 1]
        : (actualPoints.length ? actualPoints[actualPoints.length - 1] : null);
      if (origin) {
        const illusPath = doc.createElementNS(SVG_NS, "path");
        illusPath.setAttribute("d", linePath([origin, ...illustrationPoints], xScale, yScale));
        illusPath.setAttribute("class", `assessment-chart-line illustration${suffix}`);
        svg.appendChild(illusPath);
      }
    }

    points.forEach(point => {
      const pointX = xScale(point.year);
      const pointY = yScale(point.value);
      const text = trendTooltipText(point, seriesName);
      const circle = doc.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", String(pointX));
      circle.setAttribute("cy", String(pointY));
      circle.setAttribute("r", seriesName === "median" ? "3" : "4");
      circle.setAttribute("class", `assessment-chart-point ${point.kind}${suffix}`);
      circle.setAttribute("tabindex", "0");
      circle.setAttribute("role", "img");
      circle.setAttribute("aria-label", text);
      const title = doc.createElementNS(SVG_NS, "title");
      title.textContent = text;
      circle.appendChild(title);
      circle.addEventListener("mouseenter", () => showChartTooltip(tooltip, text, pointX, pointY, width, height));
      circle.addEventListener("focus", () => showChartTooltip(tooltip, text, pointX, pointY, width, height));
      circle.addEventListener("mouseleave", () => hideChartTooltip(tooltip));
      circle.addEventListener("blur", () => hideChartTooltip(tooltip));
      svg.appendChild(circle);
    });
  }

  function addTrendLegendItem(doc, svg, x, y, lineClass, pointClass, label) {
    const line = doc.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(x + 18));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", `${lineClass} assessment-legend-line`);
    svg.appendChild(line);
    if (pointClass) {
      const dot = doc.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", String(x + 9));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "3");
      dot.setAttribute("class", pointClass);
      svg.appendChild(dot);
    }
    const text = doc.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(x + 22));
    text.setAttribute("y", String(y + 4));
    text.setAttribute("class", "assessment-chart-legend-label");
    text.textContent = label;
    svg.appendChild(text);
  }

  function renderTrendChart(doc, payload, horizon = {}) {
    const includeFy2030 = horizon.includeFy2030 !== false;
    const target = qs(doc, "overview-trend-chart");
    if (!target) return;
    target.innerHTML = "";
    setText(doc, "overview-trend-coverage", trendCoverageText(payload, horizon));
    const series = buildTrendChartPoints(payload, horizon);
    const allPoints = [...series.weighted, ...series.median];
    if (!allPoints.length) {
      target.textContent = "No numeric trend data available for the selected filters.";
      return;
    }
    const { width, height, pad, yearLabelY, xAxisLabelY, legendY } = trendChartLayout();
    const years = allPoints.map(point => point.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const xDenom = Math.max(1, maxYear - minYear);
    const xScale = year => pad.left + ((year - minYear) / xDenom) * (width - pad.left - pad.right);
    const yScale = value => height - pad.bottom - (Math.max(0, Math.min(100, value)) / 100) * (height - pad.top - pad.bottom);

    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Aggregate assessment trend: weighted and median lines over time");
    const tooltip = ensureChartTooltip(doc, target);

    [0, 25, 50, 75, 100].forEach(value => {
      const y = yScale(value);
      const line = doc.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(pad.left));
      line.setAttribute("x2", String(width - pad.right));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("class", "assessment-chart-grid");
      svg.appendChild(line);
      const label = doc.createElementNS(SVG_NS, "text");
      label.setAttribute("x", "8");
      label.setAttribute("y", String(y + 4));
      label.setAttribute("class", "assessment-chart-label");
      label.textContent = `${value}%`;
      svg.appendChild(label);
    });

    // Median first so the weighted line sits visually on top.
    drawTrendSeries(doc, svg, series.median, "median", xScale, yScale, tooltip, width, height);
    drawTrendSeries(doc, svg, series.weighted, "weighted", xScale, yScale, tooltip, width, height);

    const labelYears = Array.from(new Set(years)).sort((a, b) => a - b);
    labelYears.forEach(year => {
      const label = doc.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(xScale(year)));
      label.setAttribute("y", String(yearLabelY));
      label.setAttribute("class", "assessment-chart-year");
      label.textContent = String(year);
      svg.appendChild(label);
    });

    const xAxisLabel = doc.createElementNS(SVG_NS, "text");
    xAxisLabel.setAttribute("x", String(Math.round((pad.left + width - pad.right) / 2)));
    xAxisLabel.setAttribute("y", String(xAxisLabelY));
    xAxisLabel.setAttribute("class", "assessment-chart-axis-label");
    xAxisLabel.textContent = "Fiscal year";
    svg.appendChild(xAxisLabel);

    addTrendLegendItem(doc, svg, pad.left, legendY, "assessment-chart-line actual", "assessment-chart-point actual", "Weighted");
    addTrendLegendItem(doc, svg, pad.left + 110, legendY, "assessment-chart-line actual median", "assessment-chart-point actual median", "Median");
    addTrendLegendItem(doc, svg, pad.left + 210, legendY, "assessment-chart-line forecast", null, "Forecast");
    if (includeFy2030 && allPoints.some(point => point.kind === "illustration")) {
      addTrendLegendItem(doc, svg, pad.left + 320, legendY, "assessment-chart-line illustration", null, "If-trend-continued");
    }

    target.appendChild(svg);
  }

  function renderOverview(doc, payload) {
    const horizon = readHorizon(doc);
    const includeFy2030 = horizon.includeFy2030 !== false;
    applyFy2030Visibility(doc, includeFy2030);
    const weighted = payload?.aggregates?.weighted || {};
    const median = payload?.aggregates?.medianSchool || {};
    const coverage = payload?.coverage || {};
    setText(doc, "overview-weighted-latest", formatPercent(weighted.latestActual));
    setText(doc, "overview-weighted-fy2026", formatPercent(weighted.forecast2026));
    setText(doc, "overview-weighted-fy2030", formatPercent(weighted.forecast2030));
    setText(doc, "overview-weighted-movement", formatSigned(weighted.movementPoints));
    setText(doc, "overview-weighted-status", aggregateStatusText(weighted, coverage));
    setText(doc, "overview-median-latest", formatPercent(median.latestActual));
    setText(doc, "overview-median-movement", formatSigned(median.movementPoints));
    setText(doc, "overview-context", contextText(payload));
    setText(doc, "overview-coverage", `Schools: ${safeText(coverage.schoolCount)}`);
    setText(doc, "overview-weight-coverage", `Weights: ${safeText(coverage.weightedSchoolCount)} (${formatPercent(coverage.weightCoveragePct)})`);
    renderAdvancedRows(doc, "overview-advanced-outperformers-body", "overview-advanced-outperformers-count", payload?.advancedHighlights?.outperformers, {
      emptyText: "No context overperformers matched the selected filters."
    });
    renderAdvancedRows(doc, "overview-advanced-underperformers-body", "overview-advanced-underperformers-count", payload?.advancedHighlights?.underperformers, {
      emptyText: "No context underperformers matched the selected filters."
    });
    renderRows(doc, "overview-top-increases-body", "overview-top-increases-count", payload?.topIncreases, {
      includeFy2030,
      emptyText: "No illustrative increases matched the selected filters."
    });
    renderRows(doc, "overview-top-decreases-body", "overview-top-decreases-count", payload?.topDecreases, {
      includeFy2030,
      emptyText: "No illustrative decreases matched the selected filters."
    });
    renderRows(doc, "overview-selected-body", "overview-selected-count", payload?.selectedSchools, {
      includeConfidence: true,
      includeFy2030,
      emptyText: "Add up to 10 schools above to compare them here."
    });
    renderTrendChart(doc, payload, horizon);
  }

  async function loadOptions(doc, root, state) {
    if (!root.HeliosApi?.fetchJson) return;
    const filters = readFilters(doc);
    const options = await root.HeliosApi.fetchJson(`/assessment-predictions/overview-options${buildQuery(filters)}`);
    setOptions(doc, "overview-county", options.counties, filters.county || DEFAULTS.county);
    setOptions(doc, "overview-subject", options.subjects, filters.subject || DEFAULTS.subject);
    setOptions(doc, "overview-test-level", options.testLevels, filters.testLevel || DEFAULTS.testLevel);
    setOptions(doc, "overview-subgroup", options.subgroups, filters.subgroup || DEFAULTS.subgroup);
    setOptions(doc, "overview-fay-status", options.fayStatuses, filters.fayStatus || DEFAULTS.fayStatus);
    setSchoolOptions(doc, state, options.schools);
  }

  async function loadOverview(doc, root, state) {
    clearError(doc);
    const filters = readFilters(doc);
    const payload = await root.HeliosApi.fetchJson(`/assessment-predictions/overview${buildQuery({
      ...filters,
      schoolCodes: state.selectedCodes,
      limit: 10
    })}`);
    state.latestPayload = payload;
    renderOverview(doc, payload);
  }

  async function refreshAll(doc, root, state) {
    await loadOptions(doc, root, state);
    await loadOverview(doc, root, state);
  }

  function bootstrap(doc, root) {
    const state = {
      selectedCodes: [],
      schoolByCode: new Map(),
      latestPayload: null
    };
    ["overview-county", "overview-subject", "overview-test-level", "overview-subgroup", "overview-fay-status"].forEach(id => {
      const control = qs(doc, id);
      if (!control) return;
      control.addEventListener("change", () => {
        refreshAll(doc, root, state).catch(error => showError(doc, error.message));
      });
    });
    const loadButton = qs(doc, "overview-load");
    if (loadButton) {
      loadButton.addEventListener("click", () => {
        refreshAll(doc, root, state).catch(error => showError(doc, error.message));
      });
    }
    const addButton = qs(doc, "overview-add-school");
    if (addButton) {
      addButton.addEventListener("click", () => {
        if (addSelectedSchool(doc, state)) {
          loadOverview(doc, root, state).catch(error => showError(doc, error.message));
        }
      });
    }
    const schoolInput = qs(doc, "overview-school-search");
    if (schoolInput) {
      schoolInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (addSelectedSchool(doc, state)) {
            loadOverview(doc, root, state).catch(error => showError(doc, error.message));
          }
        }
      });
    }
    const horizonToggle = qs(doc, "overview-show-fy2030");
    if (horizonToggle) {
      horizonToggle.addEventListener("change", () => {
        if (state.latestPayload) {
          renderOverview(doc, state.latestPayload);
        }
      });
    }
    refreshAll(doc, root, state).catch(error => showError(doc, error.message));
  }

  return {
    addSelectedSchool,
    aggregateStatusText,
    bootstrap,
    buildOverviewRowValues,
    buildAdvancedRowValues,
    buildQuery,
    buildTrendChartPoints,
    contextText,
    formatPercent,
    formatPercentile,
    formatSigned,
    readFilters,
    readHorizon,
    renderOverview,
    schoolCodeFromInput,
    schoolOptionLabel,
    setOptions,
    setSchoolOptions,
    trendChartLayout,
    trendCoverageText,
    trendTooltipText
  };
});

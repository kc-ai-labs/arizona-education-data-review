(function attachValidationPage(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (!root) return;
  root.HeliosValidation = Object.freeze(api);
  if (!root.document) return;
  const start = () => api.bootstrap(root.document, root);
  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : null, function buildValidationPage() {
  const DEFAULT_LIMIT = 100;
  const MAX_LIMIT = 500;

  const state = {
    coverageRows: [],
    unresolvedRows: [],
    manualReviewRows: [],
    manualExampleRows: [],
    mismatchRows: [],
    matchRows: [],
    attemptRows: []
  };

  function qs(doc, id) {
    return doc.getElementById(id);
  }

  function safeText(value) {
    return value == null || value === "" ? "-" : String(value);
  }

  function safeNumber(value, digits = 1) {
    if (value == null || value === "") return "-";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return safeText(value);
    return numeric.toFixed(digits);
  }

  function normalizeLimit(value, fallback = DEFAULT_LIMIT) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return Math.min(MAX_LIMIT, Math.max(1, Math.round(numeric)));
  }

  function maybeSchoolCode(value) {
    const text = String(value || "").trim();
    if (!/^\d+$/.test(text)) return null;
    return Number.parseInt(text, 10);
  }

  function buildQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value == null) return;
      const text = String(value).trim();
      if (!text.length) return;
      search.set(key, text);
    });
    const query = search.toString();
    return query ? `?${query}` : "";
  }

  function buildSuccessRate(summary) {
    const matched = Number(summary?.matchedCount || 0);
    const mismatched = Number(summary?.mismatchedCount || 0);
    const unavailable = Number(summary?.unavailableCount || 0);
    const errors = Number(summary?.errorCount || 0);
    const denominator = matched + mismatched + unavailable + errors;
    if (denominator <= 0) return "-";
    return `${((matched / denominator) * 100).toFixed(1)}%`;
  }

  function escapeCsv(value) {
    const text = value == null ? "" : String(value);
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function toCsv(rows, columns) {
    const header = columns.map(column => escapeCsv(column.header)).join(",");
    const body = (rows || []).map(row => columns.map(column => escapeCsv(column.value(row))).join(",")).join("\n");
    return body ? `${header}\n${body}\n` : `${header}\n`;
  }

  function showError(doc, message) {
    const el = qs(doc, "validation-api-error");
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
  }

  function clearError(doc) {
    const el = qs(doc, "validation-api-error");
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
  }

  function setText(doc, id, value) {
    const el = qs(doc, id);
    if (!el) return;
    el.textContent = value;
  }

  function parseEvidenceParts(value) {
    const text = safeText(value).trim();
    if (!text || text === "-") return [];
    return text
      .split("|")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => (
        /^https?:\/\//i.test(part)
          ? { kind: "link", text: part, href: part }
          : { kind: "text", text: part }
      ));
  }

  function buildEvidenceHeaders(count) {
    const total = Math.max(1, Number(count) || 1);
    if (total === 1) return ["Evidence"];
    return Array.from({ length: total }, (_, index) => `Evidence ${index + 1}`);
  }

  function countEvidenceColumns(rows, valueSelector) {
    const selector = typeof valueSelector === "function" ? valueSelector : row => row?.evidenceRef;
    const maxParts = (rows || []).reduce((currentMax, row) => (
      Math.max(currentMax, parseEvidenceParts(selector(row)).length)
    ), 0);
    return Math.max(1, maxParts);
  }

  function renderEvidencePart(doc, part) {
    if (!part) return null;
    const node = doc.createElement(part.kind === "link" ? "a" : "span");
    node.textContent = part.text;
    node.classList.add("validation-evidence-item");
    if (part.kind === "link") {
      node.href = part.href;
      node.target = "_blank";
      node.rel = "noreferrer noopener";
      node.title = part.text;
      node.classList.add("validation-evidence-link");
    } else {
      node.classList.add("validation-evidence-text");
    }
    return node;
  }

  function buildEvidenceCells(doc, value, count = 1) {
    const parts = parseEvidenceParts(value);
    const total = Math.max(1, Number(count) || 1, parts.length);
    return Array.from({ length: total }, (_, index) => {
      const td = doc.createElement("td");
      td.classList.add("validation-evidence-cell");
      const part = parts[index];
      if (!part) {
        td.textContent = "-";
        return td;
      }
      const node = renderEvidencePart(doc, part);
      if (node) td.appendChild(node);
      return td;
    });
  }

  function syncEvidenceHeadersForBody(tbody, count) {
    const table = tbody?.closest?.("table");
    const headerRow = table?.querySelector?.("thead tr");
    if (!headerRow) return Math.max(1, Number(count) || 1);

    const template = headerRow.querySelector('th[data-evidence-template="true"]');
    if (!template) return Math.max(1, Number(count) || 1);

    headerRow
      .querySelectorAll('th[data-evidence-generated="true"]')
      .forEach(cell => cell.remove());

    const labels = buildEvidenceHeaders(count);
    template.textContent = labels[0];
    labels.slice(1).forEach(label => {
      const th = headerRow.ownerDocument.createElement("th");
      th.textContent = label;
      th.setAttribute("data-evidence-generated", "true");
      headerRow.appendChild(th);
    });

    return labels.length;
  }

  function currentHeaderCount(tbody) {
    const table = tbody?.closest?.("table");
    const headerRow = table?.querySelector?.("thead tr");
    return headerRow?.children?.length || 1;
  }

  function formatEvidenceCell(doc, value) {
    const text = safeText(value);
    const td = doc.createElement("td");
    td.classList.add("validation-evidence-cell");
    const parts = parseEvidenceParts(text);
    if (!parts.length) {
      td.textContent = text;
      return td;
    }

    const list = doc.createElement("div");
    list.classList.add("validation-evidence-list");
    parts.forEach(part => {
      const node = doc.createElement(part.kind === "link" ? "a" : "span");
      node.textContent = part.text;
      node.classList.add("validation-evidence-item");
      if (part.kind === "link") {
        node.href = part.href;
        node.target = "_blank";
        node.rel = "noreferrer noopener";
        node.title = part.text;
        node.classList.add("validation-evidence-link");
      } else {
        node.classList.add("validation-evidence-text");
      }
      list.appendChild(node);
    });
    td.appendChild(list);
    return td;
  }

  function appendEmptyRow(doc, tbody, colspan, message) {
    const tr = doc.createElement("tr");
    const td = doc.createElement("td");
    td.colSpan = colspan;
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function renderSummary(doc, summary) {
    setText(doc, "validation-run-id", `Run ID: ${safeText(summary?.latestRunId)}`);
    setText(doc, "validation-run-meta", [
      `Label: ${safeText(summary?.runLabel)}`,
      `Mode: ${safeText(summary?.runMode)}`,
      `Sample: ${safeText(summary?.sampleSize)}`,
      `Strategy: ${safeText(summary?.sampleStrategy)}`
    ].join(" | "));
    setText(doc, "validation-run-completed", `Completed: ${safeText(summary?.completedAtUtc)}`);

    setText(doc, "validation-registry-fields", safeText(summary?.registryFieldCount ?? 0));
    setText(doc, "validation-source-confirmed", safeText(summary?.sourceConfirmedFieldCount ?? 0));
    setText(doc, "validation-unresolved-fields", safeText(summary?.unresolvedFieldCount ?? 0));
    setText(doc, "validation-attempt-count", safeText(summary?.attemptCount ?? 0));
    setText(doc, "validation-match-count", safeText(summary?.matchedCount ?? 0));
    setText(doc, "validation-mismatch-count", safeText(summary?.mismatchedCount ?? 0));
    setText(doc, "validation-unavailable-count", safeText(summary?.unavailableCount ?? 0));
    setText(doc, "validation-error-count", safeText(summary?.errorCount ?? 0));
    setText(doc, "validation-success-rate", buildSuccessRate(summary));
  }

  function safeCount(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  }

  function bucketClass(bucket) {
    const normalized = String(bucket || "unknown")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `validation-bucket-${normalized || "unknown"}`;
  }

  function buildBucketSegments(buckets) {
    const rows = (buckets || [])
      .map(row => ({
        bucket: safeText(row?.bucket),
        label: safeText(row?.label || row?.bucket),
        count: safeCount(row?.count ?? row?.rowCount ?? row?.row_count)
      }))
      .filter(row => row.bucket !== "-" && row.count > 0);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    if (total <= 0) return [];
    return rows.map(row => {
      const percent = Number(((row.count / total) * 100).toFixed(1));
      return {
        ...row,
        percent,
        percentLabel: `${percent.toFixed(1)}%`
      };
    });
  }

  function renderBucketBar(doc, barId, legendId, buckets, emptyMessage) {
    const bar = qs(doc, barId);
    const legend = qs(doc, legendId);
    if (!bar || !legend) return;
    bar.replaceChildren();
    legend.replaceChildren();

    const segments = buildBucketSegments(buckets);
    if (!segments.length) {
      const empty = doc.createElement("div");
      empty.classList.add("validation-empty-chart");
      empty.textContent = emptyMessage;
      legend.appendChild(empty);
      return;
    }

    segments.forEach(segment => {
      const node = doc.createElement("div");
      node.classList.add("validation-bar-segment", bucketClass(segment.bucket));
      node.style.width = `${segment.percent}%`;
      node.title = `${segment.label}: ${segment.count} (${segment.percentLabel})`;
      node.setAttribute("aria-label", node.title);
      bar.appendChild(node);

      const legendRow = doc.createElement("div");
      legendRow.classList.add("validation-chart-legend-item");

      const swatch = doc.createElement("span");
      swatch.classList.add("validation-chart-swatch", bucketClass(segment.bucket));
      legendRow.appendChild(swatch);

      const label = doc.createElement("span");
      label.textContent = segment.label;
      legendRow.appendChild(label);

      const value = doc.createElement("span");
      value.classList.add("validation-chart-value");
      value.textContent = `${segment.count.toLocaleString()} (${segment.percentLabel})`;
      legendRow.appendChild(value);

      legend.appendChild(legendRow);
    });
  }

  function issueCount(row) {
    return safeCount(row?.issueCount)
      || safeCount(row?.mismatchCount) + safeCount(row?.unavailableCount) + safeCount(row?.errorCount);
  }

  function sortTopIssueFields(rows) {
    return [...(rows || [])].sort((left, right) => {
      const issueDelta = issueCount(right) - issueCount(left);
      if (issueDelta) return issueDelta;
      const mismatchDelta = safeCount(right?.mismatchCount) - safeCount(left?.mismatchCount);
      if (mismatchDelta) return mismatchDelta;
      return safeText(left?.datasetField).localeCompare(safeText(right?.datasetField));
    });
  }

  function renderTopIssueFields(doc, rows) {
    const list = qs(doc, "validation-top-issues-list");
    if (!list) return;
    list.replaceChildren();
    const sorted = sortTopIssueFields(rows).slice(0, 6);
    if (!sorted.length) {
      const empty = doc.createElement("div");
      empty.classList.add("validation-empty-chart");
      empty.textContent = "No issue fields returned for the latest run.";
      list.appendChild(empty);
      return;
    }
    const maxIssueCount = Math.max(...sorted.map(issueCount), 1);
    sorted.forEach(row => {
      const item = doc.createElement("div");
      item.classList.add("validation-issue-row");

      const title = doc.createElement("strong");
      title.textContent = safeText(row?.datasetField);
      item.appendChild(title);

      const meta = doc.createElement("span");
      meta.classList.add("validation-issue-meta");
      meta.textContent = [
        `Issues: ${issueCount(row).toLocaleString()}`,
        `Mismatched: ${safeCount(row?.mismatchCount).toLocaleString()}`,
        `Unavailable: ${safeCount(row?.unavailableCount).toLocaleString()}`,
        `Errors: ${safeCount(row?.errorCount).toLocaleString()}`
      ].join(" | ");
      item.appendChild(meta);

      const meter = doc.createElement("span");
      meter.classList.add("validation-issue-meter");
      const fill = doc.createElement("span");
      fill.classList.add("validation-issue-meter-fill");
      fill.style.width = `${Number(((issueCount(row) / maxIssueCount) * 100).toFixed(1))}%`;
      meter.appendChild(fill);
      item.appendChild(meter);

      list.appendChild(item);
    });
  }

  function bucketRowsFromValues(values) {
    return Object.entries(values || {})
      .filter(([, count]) => safeCount(count) > 0)
      .map(([bucket, count]) => ({ bucket, label: labelForBucket(bucket), count: safeCount(count) }));
  }

  function labelForBucket(bucket) {
    const labels = {
      source_confirmed: "Source Confirmed",
      needs_manual_review: "Needs Manual Review",
      exhausted_no_source: "No Reproducible Source",
      matched: "Matched",
      mismatched: "Mismatched",
      not_available_on_source: "Unavailable",
      school_not_resolved: "Errors",
      extract_error: "Errors",
      value_mismatches_found: "Value Mismatches Found",
      source_confirmed_after_manual_review: "Source Confirmed After Review",
      definition_misaligned: "Definition Misaligned",
      pending_manual_review: "Pending Manual Review",
      manual_review_in_progress: "Manual Review In Progress",
      bounded_value_requires_adjudication: "Bounded Value"
    };
    if (labels[bucket]) return labels[bucket];
    return String(bucket || "")
      .split("_")
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function buildFallbackVisualSummary(summary, coverage, manualReviews) {
    const coverageRows = coverage?.rows || [];
    const fieldStatusCounts = coverageRows.reduce((counts, row) => {
      const bucket = row?.investigationStatus;
      if (!bucket) return counts;
      counts[bucket] = safeCount(counts[bucket]) + 1;
      return counts;
    }, {});
    const manualRows = manualReviews?._unavailable ? [] : (manualReviews?.rows || []);
    const manualStatusCounts = manualRows.reduce((counts, row) => {
      const bucket = row?.manualStatus;
      if (!bucket) return counts;
      counts[bucket] = safeCount(counts[bucket]) + 1;
      return counts;
    }, {});

    return {
      manualReviewAvailable: !manualReviews?._unavailable && manualRows.length > 0,
      fieldStatusBuckets: bucketRowsFromValues(fieldStatusCounts),
      valueOutcomeBuckets: bucketRowsFromValues({
        matched: summary?.matchedCount,
        mismatched: summary?.mismatchedCount,
        not_available_on_source: summary?.unavailableCount,
        school_not_resolved: summary?.errorCount
      }),
      manualStatusBuckets: bucketRowsFromValues(manualStatusCounts),
      topIssueFields: coverageRows
        .map(row => ({
          datasetField: row.datasetField,
          investigationStatus: row.investigationStatus,
          matchCount: safeCount(row.matchCount),
          mismatchCount: safeCount(row.mismatchCount),
          unavailableCount: safeCount(row.unavailableCount),
          errorCount: safeCount(row.errorCount),
          issueCount: safeCount(row.mismatchCount) + safeCount(row.unavailableCount) + safeCount(row.errorCount)
        }))
        .filter(row => row.issueCount > 0)
    };
  }

  function renderVisualSummary(doc, payload) {
    const visual = payload || {};
    renderBucketBar(
      doc,
      "validation-field-coverage-bar",
      "validation-field-coverage-legend",
      visual.fieldStatusBuckets,
      "No field coverage rows returned for the latest run."
    );
    renderBucketBar(
      doc,
      "validation-value-outcome-bar",
      "validation-value-outcome-legend",
      visual.valueOutcomeBuckets,
      "No row-level validation outcomes returned for the latest run."
    );

    const manualNote = qs(doc, "validation-manual-status-note");
    if (visual.manualReviewAvailable) {
      if (manualNote) {
        manualNote.textContent = (visual.manualStatusBuckets || []).length
          ? "Human decision layer for fields AI could not fully resolve."
          : "Manual adjudication is available, but no decisions are loaded for this run.";
      }
      renderBucketBar(
        doc,
        "validation-manual-status-bar",
        "validation-manual-status-legend",
        visual.manualStatusBuckets,
        "No manual decisions are loaded for this latest run."
      );
    } else {
      if (manualNote) {
        manualNote.textContent = "Manual adjudication is not loaded for this latest run.";
      }
      renderBucketBar(
        doc,
        "validation-manual-status-bar",
        "validation-manual-status-legend",
        [],
        "Manual review tables or decisions are not available yet."
      );
    }

    renderTopIssueFields(doc, visual.topIssueFields || []);
  }

  function renderCoverage(doc, payload) {
    const tbody = qs(doc, "validation-coverage-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = payload?.rows || [];
    const evidenceColumnCount = syncEvidenceHeadersForBody(
      tbody,
      countEvidenceColumns(rows, row => row.evidenceRef)
    );
    state.coverageRows = rows;
    if (!rows.length) {
      appendEmptyRow(doc, tbody, currentHeaderCount(tbody), "No coverage rows returned for the current filters.");
    }
    rows.forEach(row => {
      const tr = doc.createElement("tr");
      [
        row.datasetField,
        row.sourceFamily,
        row.authoritativeSource,
        row.investigationStatus,
        row.attemptCount,
        row.matchCount,
        row.mismatchCount,
        row.unavailableCount,
        row.errorCount
      ].forEach((cell, index) => {
        const td = doc.createElement("td");
        td.textContent = safeText(cell);
        if (index === 0) td.classList.add("pair-label-cell");
        tr.appendChild(td);
      });
      buildEvidenceCells(doc, row.evidenceRef, evidenceColumnCount).forEach(cell => tr.appendChild(cell));
      tbody.appendChild(tr);
    });
    setText(doc, "validation-coverage-count", `Rows: ${rows.length}`);
  }

  function renderUnresolved(doc, payload) {
    const tbody = qs(doc, "validation-unresolved-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = payload?.rows || [];
    const evidenceColumnCount = syncEvidenceHeadersForBody(
      tbody,
      countEvidenceColumns(rows, row => row.evidenceRef)
    );
    state.unresolvedRows = rows;
    if (!rows.length) {
      appendEmptyRow(doc, tbody, currentHeaderCount(tbody), "No unresolved columns remain for the current latest run.");
    }
    rows.forEach(row => {
      const tr = doc.createElement("tr");
      [
        row.datasetField,
        row.investigationStatus,
        row.authoritativeSource,
        row.attemptCount,
        row.errorCount
      ].forEach((cell, index) => {
        const td = doc.createElement("td");
        td.textContent = safeText(cell);
        if (index === 0) td.classList.add("pair-label-cell");
        tr.appendChild(td);
      });
      buildEvidenceCells(doc, row.evidenceRef, evidenceColumnCount).forEach(cell => tr.appendChild(cell));
      tbody.appendChild(tr);
    });
    setText(doc, "validation-unresolved-count", `Rows: ${rows.length}`);
  }

  function renderManualReviewRows(doc, payload) {
    const tbody = qs(doc, "validation-manual-reviews-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = payload?.rows || [];
    const evidenceColumnCount = syncEvidenceHeadersForBody(
      tbody,
      countEvidenceColumns(rows, row => row.evidenceRef)
    );
    state.manualReviewRows = rows;
    if (!rows.length) {
      appendEmptyRow(doc, tbody, currentHeaderCount(tbody), "No manual review decisions have been imported for the current latest run.");
    }
    rows.forEach(row => {
      const tr = doc.createElement("tr");
      [
        row.datasetField,
        row.automatedStatus,
        row.manualStatus,
        row.exampleCount,
        row.reviewNotes || row.rationale,
        row.recommendedAction,
        row.reviewedAtUtc
      ].forEach((cell, index) => {
        const td = doc.createElement("td");
        td.textContent = safeText(cell);
        if (index === 0) td.classList.add("pair-label-cell");
        tr.appendChild(td);
      });
      buildEvidenceCells(doc, row.evidenceRef, evidenceColumnCount).forEach(cell => tr.appendChild(cell));
      tbody.appendChild(tr);
    });
    setText(doc, "validation-manual-reviews-count", `Rows: ${rows.length}`);
  }

  function renderManualExampleRows(doc, payload) {
    const tbody = qs(doc, "validation-manual-examples-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = payload?.rows || [];
    const evidenceColumnCount = syncEvidenceHeadersForBody(
      tbody,
      countEvidenceColumns(rows, row => [row.sourceUrl, row.uiUrl, row.workbookEvidence].filter(Boolean).join(" | "))
    );
    state.manualExampleRows = rows;
    if (!rows.length) {
      appendEmptyRow(doc, tbody, currentHeaderCount(tbody), "No manual examples have been imported for the current filters.");
    }
    rows.forEach(row => {
      const tr = doc.createElement("tr");
      [
        `${safeText(row.schoolName)} (${safeText(row.schoolCode)})`,
        row.datasetField,
        row.localValue,
        row.sourceValue,
        row.sourceFiscalYear,
        row.comparisonClassification,
        row.whyThisExampleMatters || row.exampleNotes
      ].forEach((cell, index) => {
        const td = doc.createElement("td");
        td.textContent = safeText(cell);
        if (index <= 1) td.classList.add("pair-label-cell");
        tr.appendChild(td);
      });
      const evidence = [row.sourceUrl, row.uiUrl, row.workbookEvidence].filter(Boolean).join(" | ");
      buildEvidenceCells(doc, evidence, evidenceColumnCount).forEach(cell => tr.appendChild(cell));
      tbody.appendChild(tr);
    });
    setText(doc, "validation-manual-examples-count", `Rows: ${rows.length}`);
  }

  function renderResultRows(doc, tbodyId, countId, rows, emptyMessage) {
    const tbody = qs(doc, tbodyId);
    if (!tbody) return;
    tbody.innerHTML = "";
    const evidenceColumnCount = syncEvidenceHeadersForBody(
      tbody,
      countEvidenceColumns(rows, row => row.evidenceRef)
    );
    if (!rows.length) {
      appendEmptyRow(doc, tbody, currentHeaderCount(tbody), emptyMessage);
    }
    rows.forEach(row => {
      const tr = doc.createElement("tr");
      [
        `${safeText(row.schoolName)} (${safeText(row.schoolCode)})`,
        row.datasetField,
        row.localValue,
        row.sourceValue,
        row.confidence,
        row.sourceUsed,
        row.comparedAtUtc
      ].forEach((cell, index) => {
        const td = doc.createElement("td");
        td.textContent = safeText(cell);
        if (index <= 1) td.classList.add("pair-label-cell");
        tr.appendChild(td);
      });
      buildEvidenceCells(doc, row.evidenceRef, evidenceColumnCount).forEach(cell => tr.appendChild(cell));
      tbody.appendChild(tr);
    });
    setText(doc, countId, `Rows: ${rows.length}`);
  }

  function renderAttempts(doc, payload) {
    const tbody = qs(doc, "validation-attempts-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = payload?.rows || [];
    const evidenceColumnCount = syncEvidenceHeadersForBody(
      tbody,
      countEvidenceColumns(rows, row => row.evidenceRef || row.sourceReference)
    );
    state.attemptRows = rows;
    if (!rows.length) {
      appendEmptyRow(doc, tbody, currentHeaderCount(tbody), "No attempt rows returned for the current filters.");
    }
    rows.forEach(row => {
      const tr = doc.createElement("tr");
      [
        row.datasetField,
        row.schoolName ? `${safeText(row.schoolName)} (${safeText(row.schoolCode)})` : row.schoolCode,
        row.attemptStage,
        row.attemptResult,
        row.sourceType,
        row.locator,
        row.queryText,
        row.failureReason
      ].forEach((cell, index) => {
        const td = doc.createElement("td");
        td.textContent = safeText(cell);
        if (index === 0) td.classList.add("pair-label-cell");
        tr.appendChild(td);
      });
      buildEvidenceCells(doc, row.evidenceRef || row.sourceReference, evidenceColumnCount).forEach(cell => tr.appendChild(cell));
      tbody.appendChild(tr);
    });
    setText(doc, "validation-attempts-count", `Rows: ${rows.length}`);
  }

  function renderSchoolSnapshot(doc, query, coverageRows, matchRows, mismatchRows, attemptRows, manualReviewRows) {
    const targetEl = qs(doc, "validation-school-snapshot-target");
    const wrap = qs(doc, "validation-school-snapshot-wrap");
    const emptyEl = qs(doc, "validation-school-snapshot-empty");
    const tbody = qs(doc, "validation-school-snapshot-body");
    const chipsEl = qs(doc, "validation-school-snapshot-chips");
    if (!tbody || !wrap || !emptyEl || !targetEl || !chipsEl) return;

    tbody.innerHTML = "";
    chipsEl.innerHTML = "";

    if (!query) {
      wrap.hidden = true;
      emptyEl.hidden = true;
      targetEl.innerHTML = "<strong>No school selected.</strong> Type a school code (e.g. <code>5958</code>) or partial name in the search box and press Refresh.";
      return;
    }

    // Per-school rows already filtered server-side via schoolQuery.
    // Build dataset_field -> row map; pick a single school (the most-represented one) to anchor the snapshot.
    const allRows = [...(matchRows || []), ...(mismatchRows || []), ...(attemptRows || [])];
    if (!allRows.length) {
      wrap.hidden = true;
      emptyEl.hidden = false;
      targetEl.innerHTML = `Searched: <code>${safeText(query)}</code> — <strong>no rows returned.</strong>`;
      return;
    }

    // Pick the most-frequent (schoolCode, schoolName) pair as the anchor.
    const schoolCounts = new Map();
    allRows.forEach(r => {
      if (!r || r.schoolCode === undefined || r.schoolCode === null) return;
      const key = `${r.schoolCode}::${r.schoolName || ""}`;
      schoolCounts.set(key, (schoolCounts.get(key) || 0) + 1);
    });
    let anchorKey = null, anchorCount = 0;
    schoolCounts.forEach((count, key) => {
      if (count > anchorCount) { anchorCount = count; anchorKey = key; }
    });
    const [anchorCodeStr, anchorNameRaw] = (anchorKey || "::").split("::");
    const anchorCode = anchorCodeStr ? Number(anchorCodeStr) : null;
    const anchorName = anchorNameRaw || "";

    // Index all data by datasetField FOR THE ANCHOR SCHOOL.
    const filterAnchor = r => r && (
      (anchorCode !== null && Number(r.schoolCode) === anchorCode) ||
      (!anchorCode && r.schoolName === anchorName)
    );
    const matchByField = new Map();
    (matchRows || []).filter(filterAnchor).forEach(r => matchByField.set(r.datasetField, r));
    const mismatchByField = new Map();
    (mismatchRows || []).filter(filterAnchor).forEach(r => mismatchByField.set(r.datasetField, r));
    const attemptByField = new Map();
    (attemptRows || []).filter(filterAnchor).forEach(r => {
      if (!attemptByField.has(r.datasetField)) attemptByField.set(r.datasetField, r);
    });

    // Manual reviews are field-level (not school-level); index globally.
    const manualByField = new Map();
    (manualReviewRows || []).forEach(r => {
      if (r && r.datasetField) manualByField.set(r.datasetField, r);
    });

    // Coverage rows give us all 61 fields with source family + investigation status.
    const coverage = coverageRows || [];
    const fieldOrder = coverage.length
      ? coverage.map(r => r.datasetField)
      : Array.from(new Set([
          ...matchByField.keys(),
          ...mismatchByField.keys(),
          ...attemptByField.keys()
        ])).sort();

    let matched = 0, mismatched = 0, unavailable = 0, errored = 0, notAttempted = 0;

    const evidenceColumnCount = syncEvidenceHeadersForBody(
      tbody,
      Math.max(1, countEvidenceColumns(
        [...matchByField.values(), ...mismatchByField.values(), ...attemptByField.values()],
        row => row.evidenceRef || row.sourceReference
      ))
    );

    fieldOrder.forEach(field => {
      const tr = doc.createElement("tr");
      tr.classList.add("validation-school-snapshot-row");

      const coverageRow = coverage.find(c => c.datasetField === field) || {};
      const match = matchByField.get(field);
      const mismatch = mismatchByField.get(field);
      const attempt = attemptByField.get(field);
      const manual = manualByField.get(field);

      let status = "not_attempted";
      let localValue = "";
      let sourceValue = "";
      let sourceUsed = "";
      let evidenceRef = coverageRow.evidenceRef || "";

      if (mismatch) {
        status = "mismatched";
        localValue = safeText(mismatch.localValue);
        sourceValue = safeText(mismatch.sourceValue);
        sourceUsed = safeText(mismatch.sourceUsed);
        evidenceRef = mismatch.evidenceRef || evidenceRef;
        mismatched += 1;
      } else if (match) {
        status = "matched";
        localValue = safeText(match.localValue);
        sourceValue = safeText(match.sourceValue);
        sourceUsed = safeText(match.sourceUsed);
        evidenceRef = match.evidenceRef || evidenceRef;
        matched += 1;
      } else if (attempt) {
        const result = attempt.attemptResult || "";
        if (result === "not_available_on_source") {
          status = "not_available_on_source";
          unavailable += 1;
        } else if (result === "extract_error" || result === "school_not_resolved") {
          status = result;
          errored += 1;
        } else if (result === "matched" || result === "mismatched") {
          status = result;
          if (result === "matched") matched += 1; else mismatched += 1;
        } else {
          status = result || "not_attempted";
          notAttempted += 1;
        }
        sourceUsed = safeText(attempt.sourceType);
        evidenceRef = attempt.evidenceRef || attempt.sourceReference || evidenceRef;
      } else {
        notAttempted += 1;
      }

      const cells = [
        ["pair-label-cell", safeText(field)],
        ["", safeText(coverageRow.sourceFamily || "—")],
        ["", null],
        ["", localValue || "—"],
        ["", sourceValue || "—"],
        ["", null],
        ["", sourceUsed || "—"]
      ];
      cells.forEach(([cls, text], idx) => {
        const td = doc.createElement("td");
        if (cls) td.classList.add(cls);
        if (idx === 2) {
          const badge = doc.createElement("span");
          badge.className = `validation-school-status-badge ${status}`;
          badge.textContent = status.replace(/_/g, " ");
          td.appendChild(badge);
        } else if (idx === 5) {
          if (manual && manual.manualStatus) {
            const span = doc.createElement("span");
            span.className = `validation-manual-verdict ${manual.manualStatus}`;
            span.textContent = manual.manualStatus.replace(/_/g, " ");
            td.appendChild(span);
            if (manual.recommendedAction) {
              const detail = doc.createElement("div");
              detail.className = "subtle";
              detail.style.fontSize = "11px";
              detail.style.marginTop = "2px";
              detail.textContent = String(manual.recommendedAction).slice(0, 120);
              td.appendChild(detail);
            }
          } else {
            td.textContent = "—";
            td.classList.add("subtle");
          }
        } else {
          td.textContent = text;
        }
        tr.appendChild(td);
      });

      buildEvidenceCells(doc, evidenceRef, evidenceColumnCount).forEach(cell => tr.appendChild(cell));
      tbody.appendChild(tr);
    });

    targetEl.innerHTML = `Showing: <strong>${safeText(anchorName)}</strong> <code>(${safeText(anchorCode)})</code> — ${fieldOrder.length} fields`;
    wrap.hidden = false;
    emptyEl.hidden = true;

    const chipDef = (label, count, css) => {
      const span = doc.createElement("span");
      span.className = `chip ${css}`;
      span.textContent = `${label}: ${count}`;
      return span;
    };
    chipsEl.appendChild(chipDef("Matched", matched, "info-chip"));
    chipsEl.appendChild(chipDef("Mismatched", mismatched, "info-chip"));
    chipsEl.appendChild(chipDef("Unavailable", unavailable, "info-chip"));
    chipsEl.appendChild(chipDef("Errors", errored, "info-chip"));
    chipsEl.appendChild(chipDef("Not yet sourced", notAttempted, "info-chip"));
  }

  function downloadCsv(root, filename, csvText) {
    if (!root?.Blob || !root?.URL || !root?.document) return;
    const blob = new root.Blob([csvText], { type: "text/csv;charset=utf-8" });
    const href = root.URL.createObjectURL(blob);
    const anchor = root.document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    root.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    root.URL.revokeObjectURL(href);
  }

  function attachExportHandlers(doc, root) {
    const exports = [
      {
        id: "validation-export-coverage",
        filename: "validation-coverage.csv",
        rows: () => state.coverageRows,
        columns: [
          { header: "datasetField", value: row => row.datasetField },
          { header: "sourceFamily", value: row => row.sourceFamily },
          { header: "authoritativeSource", value: row => row.authoritativeSource },
          { header: "investigationStatus", value: row => row.investigationStatus },
          { header: "attemptCount", value: row => row.attemptCount },
          { header: "matchCount", value: row => row.matchCount },
          { header: "mismatchCount", value: row => row.mismatchCount },
          { header: "unavailableCount", value: row => row.unavailableCount },
          { header: "errorCount", value: row => row.errorCount },
          { header: "evidenceRef", value: row => row.evidenceRef }
        ]
      },
      {
        id: "validation-export-unresolved",
        filename: "validation-unresolved-columns.csv",
        rows: () => state.unresolvedRows,
        columns: [
          { header: "datasetField", value: row => row.datasetField },
          { header: "investigationStatus", value: row => row.investigationStatus },
          { header: "authoritativeSource", value: row => row.authoritativeSource },
          { header: "attemptCount", value: row => row.attemptCount },
          { header: "errorCount", value: row => row.errorCount },
          { header: "evidenceRef", value: row => row.evidenceRef }
        ]
      },
      {
        id: "validation-export-mismatches",
        filename: "validation-mismatches.csv",
        rows: () => state.mismatchRows,
        columns: [
          { header: "schoolCode", value: row => row.schoolCode },
          { header: "schoolName", value: row => row.schoolName },
          { header: "datasetField", value: row => row.datasetField },
          { header: "localValue", value: row => row.localValue },
          { header: "sourceValue", value: row => row.sourceValue },
          { header: "confidence", value: row => row.confidence },
          { header: "sourceUsed", value: row => row.sourceUsed },
          { header: "evidenceRef", value: row => row.evidenceRef },
          { header: "comparedAtUtc", value: row => row.comparedAtUtc }
        ]
      },
      {
        id: "validation-export-manual-reviews",
        filename: "validation-manual-reviews.csv",
        rows: () => state.manualReviewRows,
        columns: [
          { header: "datasetField", value: row => row.datasetField },
          { header: "automatedStatus", value: row => row.automatedStatus },
          { header: "manualStatus", value: row => row.manualStatus },
          { header: "exampleCount", value: row => row.exampleCount },
          { header: "reviewNotes", value: row => row.reviewNotes },
          { header: "recommendedAction", value: row => row.recommendedAction },
          { header: "evidenceRef", value: row => row.evidenceRef },
          { header: "reviewedAtUtc", value: row => row.reviewedAtUtc }
        ]
      },
      {
        id: "validation-export-manual-examples",
        filename: "validation-manual-examples.csv",
        rows: () => state.manualExampleRows,
        columns: [
          { header: "schoolCode", value: row => row.schoolCode },
          { header: "schoolName", value: row => row.schoolName },
          { header: "datasetField", value: row => row.datasetField },
          { header: "localValue", value: row => row.localValue },
          { header: "sourceValue", value: row => row.sourceValue },
          { header: "sourceFiscalYear", value: row => row.sourceFiscalYear },
          { header: "comparisonClassification", value: row => row.comparisonClassification },
          { header: "whyThisExampleMatters", value: row => row.whyThisExampleMatters },
          { header: "sourceUrl", value: row => row.sourceUrl },
          { header: "uiUrl", value: row => row.uiUrl },
          { header: "workbookEvidence", value: row => row.workbookEvidence }
        ]
      },
      {
        id: "validation-export-matches",
        filename: "validation-matches.csv",
        rows: () => state.matchRows,
        columns: [
          { header: "schoolCode", value: row => row.schoolCode },
          { header: "schoolName", value: row => row.schoolName },
          { header: "datasetField", value: row => row.datasetField },
          { header: "localValue", value: row => row.localValue },
          { header: "sourceValue", value: row => row.sourceValue },
          { header: "confidence", value: row => row.confidence },
          { header: "sourceUsed", value: row => row.sourceUsed },
          { header: "evidenceRef", value: row => row.evidenceRef },
          { header: "comparedAtUtc", value: row => row.comparedAtUtc }
        ]
      },
      {
        id: "validation-export-attempts",
        filename: "validation-attempts.csv",
        rows: () => state.attemptRows,
        columns: [
          { header: "datasetField", value: row => row.datasetField },
          { header: "schoolCode", value: row => row.schoolCode },
          { header: "schoolName", value: row => row.schoolName },
          { header: "attemptStage", value: row => row.attemptStage },
          { header: "attemptResult", value: row => row.attemptResult },
          { header: "sourceType", value: row => row.sourceType },
          { header: "locator", value: row => row.locator },
          { header: "queryText", value: row => row.queryText },
          { header: "evidenceRef", value: row => row.evidenceRef },
          { header: "failureReason", value: row => row.failureReason }
        ]
      }
    ];

    exports.forEach(config => {
      const button = qs(doc, config.id);
      if (!button) return;
      button.addEventListener("click", () => {
        downloadCsv(root, config.filename, toCsv(config.rows(), config.columns));
      });
    });
  }

  async function refresh(doc, root) {
    clearError(doc);
    const fetchJson = root?.HeliosApi?.fetchJson;
    if (typeof fetchJson !== "function") {
      showError(doc, "Validation API helper is unavailable on this page.");
      return;
    }

    const fieldSearch = String(qs(doc, "validation-field-search")?.value || "").trim();
    const schoolQuery = String(qs(doc, "validation-school-search")?.value || "").trim();
    const coverageStatus = String(qs(doc, "validation-coverage-status")?.value || "").trim();
    const attemptResult = String(qs(doc, "validation-attempt-result")?.value || "").trim();
    const limit = normalizeLimit(qs(doc, "validation-limit")?.value, DEFAULT_LIMIT);
    setText(doc, "validation-limit-note", `Limit: ${limit} rows per API section`);

    try {
      const optionalFetch = path => fetchJson(path).catch(error => ({
        _unavailable: true,
        error: error?.message || "Unavailable",
        rows: []
      }));

      const [summary, coverage, unresolved, mismatches, matches, attempts, manualReviews, manualExamples, visualSummary] = await Promise.all([
        fetchJson("/validation/summary"),
        fetchJson(`/validation/coverage${buildQuery({ status: coverageStatus || null, search: fieldSearch || null, limit })}`),
        fetchJson(`/validation/unresolved-columns${buildQuery({ search: fieldSearch || null, limit })}`),
        fetchJson(`/validation/mismatches${buildQuery({ field: fieldSearch || null, schoolQuery: schoolQuery || null, limit })}`),
        fetchJson(`/validation/matches${buildQuery({ field: fieldSearch || null, schoolQuery: schoolQuery || null, limit })}`),
        fetchJson(`/validation/attempts${buildQuery({
          field: fieldSearch || null,
          schoolCode: maybeSchoolCode(schoolQuery),
          schoolQuery: schoolQuery || null,
          attemptResult: attemptResult || null,
          limit
        })}`),
        optionalFetch(`/validation/manual-reviews${buildQuery({ search: fieldSearch || null, limit })}`),
        optionalFetch(`/validation/manual-examples${buildQuery({ field: fieldSearch || null, schoolQuery: schoolQuery || null, limit })}`),
        optionalFetch("/validation/visual-summary")
      ]);

      renderSummary(doc, summary || {});
      renderCoverage(doc, coverage || {});
      renderUnresolved(doc, unresolved || {});
      state.mismatchRows = mismatches?.rows || [];
      renderResultRows(doc, "validation-mismatches-body", "validation-mismatches-count", state.mismatchRows, "No mismatches returned for the current filters.");
      state.matchRows = matches?.rows || [];
      renderResultRows(doc, "validation-matches-body", "validation-matches-count", state.matchRows, "No matched rows returned for the current filters.");
      renderAttempts(doc, attempts || {});
      renderManualReviewRows(doc, manualReviews || {});
      renderManualExampleRows(doc, manualExamples || {});
      renderSchoolSnapshot(
        doc,
        schoolQuery,
        state.coverageRows || [],
        state.matchRows || [],
        state.mismatchRows || [],
        state.attemptRows || [],
        state.manualReviewRows || []
      );
      renderVisualSummary(
        doc,
        visualSummary?._unavailable
          ? buildFallbackVisualSummary(summary || {}, coverage || {}, manualReviews || {})
          : visualSummary
      );
    } catch (error) {
      console.error("validation refresh failed", error);
      showError(doc, error?.message || "Unable to load validation data right now.");
    }
  }

  function installHandlers(doc, root) {
    [
      "validation-refresh",
      "validation-coverage-status",
      "validation-attempt-result"
    ].forEach(id => {
      const el = qs(doc, id);
      if (!el) return;
      const eventName = id === "validation-refresh" ? "click" : "change";
      el.addEventListener(eventName, () => refresh(doc, root));
    });

    ["validation-field-search", "validation-school-search", "validation-limit"].forEach(id => {
      const el = qs(doc, id);
      if (!el) return;
      el.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          refresh(doc, root);
        }
      });
    });

    attachExportHandlers(doc, root);
  }

  function bootstrap(doc, root) {
    installHandlers(doc, root);
    refresh(doc, root);
  }

  return {
    buildBucketSegments,
    buildEvidenceCells,
    buildEvidenceHeaders,
    buildQuery,
    buildSuccessRate,
    buildFallbackVisualSummary,
    countEvidenceColumns,
    formatEvidenceCell,
    renderBucketBar,
    renderVisualSummary,
    renderManualExampleRows,
    renderManualReviewRows,
    maybeSchoolCode,
    normalizeLimit,
    parseEvidenceParts,
    sortTopIssueFields,
    safeNumber,
    safeText,
    toCsv,
    bootstrap
  };
});

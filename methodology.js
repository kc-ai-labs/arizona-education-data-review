function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value) {
  return value == null ? "" : String(value);
}

function escapeHtml(value) {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusLabel(status) {
  switch (status) {
    case "met":
      return "Met";
    case "partial":
      return "Partially Met";
    case "not_met":
      return "Not Met";
    default:
      return "Unknown";
  }
}

function statusClass(status) {
  switch (status) {
    case "met":
      return "is-met";
    case "partial":
      return "is-partial";
    case "not_met":
      return "is-not-met";
    default:
      return "is-unknown";
  }
}

function createStatusBadge(status) {
  return `<span class="status-badge ${statusClass(status)}">${statusLabel(status)}</span>`;
}

function renderMeta(data) {
  const meta = data.pageMeta || {};
  document.getElementById("methodology-title").textContent = meta.title || "Methodology";
  document.getElementById("methodology-phase").textContent = meta.phase || "Phase 1";
  document.getElementById("methodology-scope").textContent = meta.scopeNote || "";

  const metaRow = document.getElementById("methodology-meta");
  const badges = [
    `As of: ${meta.asOfDate || "n/a"}`,
    `Generated: ${meta.generatedAtUtc || "n/a"}`,
    `Traceability last verified: ${meta.traceabilityLastVerified || "n/a"}`,
    `Snapshot version: ${meta.snapshotVersion || "n/a"}`,
    "Mode: Generated frontend snapshot"
  ];

  metaRow.innerHTML = badges
    .map(text => `<div class="badge methodology-meta-badge">${escapeHtml(text)}</div>`)
    .join("");
}

function renderSummaryCards(requirements, requiredGaps) {
  const container = document.getElementById("methodology-summary-cards");
  const counts = {
    total: requirements.length,
    met: requirements.filter(r => r.status === "met").length,
    partial: requirements.filter(r => r.status === "partial").length,
    notMet: requirements.filter(r => r.status === "not_met").length,
    requiredGapCount: requiredGaps.length
  };

  const cards = [
    ["Phase 1 Requirements", counts.total],
    ["Met", counts.met],
    ["Partially Met", counts.partial],
    ["Not Met", counts.notMet],
    ["Required Gaps", counts.requiredGapCount]
  ];

  container.innerHTML = cards
    .map(([label, value]) => `
      <div class="summary-card methodology-summary-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `)
    .join("");
}

function renderLinksInline(links) {
  const items = safeArray(links).map(link => {
    const label = escapeHtml(link.label || "Link");
    const note = link.note ? `<div class="methodology-link-note">${escapeHtml(link.note)}</div>` : "";

    if (!link.url) {
      return `<div class="methodology-link unresolved"><span>${label}</span>${note}</div>`;
    }

    return `
      <a class="methodology-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${label}</a>
      ${note}
    `;
  });
  return items.length ? items.join("") : "-";
}

function renderEvidenceInline(evidence) {
  const first = safeArray(evidence)[0];
  if (!first) return "-";
  const body = `${safeText(first.label)}: ${safeText(first.value)}`;
  if (first.source_url) {
    return `<a href="${escapeHtml(first.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(body)}</a>`;
  }
  return escapeHtml(body);
}

function renderRequirementsTable(requirements) {
  const tbody = document.getElementById("methodology-requirements-body");
  tbody.innerHTML = requirements
    .map(req => `
      <tr>
        <td><code>${escapeHtml(req.id)}</code></td>
        <td>${createStatusBadge(req.status)}</td>
        <td>
          <div class="methodology-table-primary">${escapeHtml(req.title)}</div>
          <div class="methodology-table-secondary">${escapeHtml(req.status_reason || "")}</div>
        </td>
        <td>${renderEvidenceInline(req.evidence)}</td>
        <td><div class="methodology-inline-links">${renderLinksInline(req.links)}</div></td>
      </tr>
    `)
    .join("");
}

function renderEvidenceList(evidence) {
  const items = safeArray(evidence).map(item => {
    const body = `<strong>${escapeHtml(item.label || "Evidence")}:</strong> ${escapeHtml(item.value || "")}`;
    if (item.source_url) {
      return `<li>${body}<div><a href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source_label || "Source")}</a></div></li>`;
    }
    return `<li>${body}</li>`;
  });
  return items.length ? `<ul class="notes-list">${items.join("")}</ul>` : "<p class='subtle'>No evidence recorded.</p>";
}

function renderCodeSamples(samples) {
  const blocks = safeArray(samples).map(sample => `
    <section class="methodology-code-sample">
      <h5>${escapeHtml(sample.title || "Code sample")}</h5>
      <pre><code class="language-${escapeHtml(sample.language || "text")}">${escapeHtml(sample.code || "")}</code></pre>
      <div class="methodology-code-source">
        <a href="${escapeHtml(sample.source_url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(sample.source_label || "Source")}</a>
      </div>
    </section>
  `);

  return blocks.length ? blocks.join("") : "<p class='subtle'>No code samples recorded.</p>";
}

function renderRequirementDetails(requirements) {
  const container = document.getElementById("methodology-requirement-details");
  container.innerHTML = requirements
    .map(req => {
      const requiredGaps = safeArray(req.required_gaps);
      const gapHtml = requiredGaps.length
        ? `<section class="methodology-detail-card"><h4>Required Gaps</h4><ul class="notes-list">${requiredGaps.map(g => `<li>${escapeHtml(g)}</li>`).join("")}</ul></section>`
        : "";

      return `
        <details class="methodology-accordion-item" ${req.status === "partial" ? "open" : ""}>
          <summary class="methodology-accordion-summary">
            <div class="methodology-accordion-title">
              <div class="methodology-accordion-title-row">
                <strong>${escapeHtml(req.id)} - ${escapeHtml(req.title)}</strong>
                ${createStatusBadge(req.status)}
              </div>
              <div class="methodology-accordion-subtitle">${escapeHtml(req.status_reason || "")}</div>
            </div>
          </summary>
          <div class="methodology-accordion-body">
            <div class="methodology-detail-grid">
              <section class="methodology-detail-card">
                <h4>Evidence</h4>
                ${renderEvidenceList(req.evidence)}
              </section>
              <section class="methodology-detail-card">
                <h4>Links</h4>
                <div class="methodology-detail-links">${renderLinksInline(req.links)}</div>
              </section>
              ${gapHtml}
              <section class="methodology-detail-card methodology-detail-wide">
                <h4>Code Samples</h4>
                ${renderCodeSamples(req.code_samples)}
              </section>
            </div>
          </div>
        </details>
      `;
    })
    .join("");
}

function renderRequiredGaps(requiredGaps) {
  const container = document.getElementById("methodology-required-gaps");
  if (!requiredGaps.length) {
    container.innerHTML = "<p class='subtle'>No required gaps are currently open.</p>";
    return;
  }

  container.innerHTML = `
    <ul class="notes-list methodology-gap-list">
      ${requiredGaps.map(item => `
        <li>
          <div class="methodology-gap-title">${escapeHtml(item.req_id)}: ${escapeHtml(item.label)}</div>
          <div class="methodology-gap-why">${escapeHtml(item.why || "")}</div>
          <div class="methodology-gap-source"><a href="${escapeHtml(item.source_url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source_label || "Source")}</a></div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderBacklog(backlog) {
  const container = document.getElementById("methodology-backlog");
  const recommended = safeArray(backlog.recommended_improvement);
  const optional = safeArray(backlog.optional_extension);

  function renderItems(items) {
    if (!items.length) return "<p class='subtle'>None</p>";
    return `
      <ul class="notes-list methodology-gap-list">
        ${items.map(item => `
          <li>
            <div class="methodology-gap-title">${escapeHtml(item.label)}</div>
            <div class="methodology-gap-why">${escapeHtml(item.why || "")}</div>
            <div class="methodology-gap-source"><a href="${escapeHtml(item.source_url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source_label || "Source")}</a></div>
          </li>
        `).join("")}
      </ul>
    `;
  }

  container.innerHTML = `
    <div class="methodology-backlog-grid">
      <section class="summary-detail-card methodology-open-card">
        <h3>Recommended Improvements (${recommended.length})</h3>
        ${renderItems(recommended)}
      </section>
      <section class="summary-detail-card methodology-open-card">
        <h3>Optional Extensions (${optional.length})</h3>
        ${renderItems(optional)}
      </section>
    </div>
  `;
}

function initMethodologyPage() {
  const data = window.METHODOLOGY_DATA;
  const err = document.getElementById("methodology-error");

  if (!data) {
    err.hidden = false;
    err.textContent = "Methodology data is unavailable.";
    return;
  }

  const requirements = safeArray(data.requirements);
  const requiredGaps = safeArray(data.requiredGaps);

  renderMeta(data);
  renderSummaryCards(requirements, requiredGaps);
  renderRequirementsTable(requirements);
  renderRequirementDetails(requirements);
  renderRequiredGaps(requiredGaps);
  renderBacklog(data.backlog || {});
}

initMethodologyPage();

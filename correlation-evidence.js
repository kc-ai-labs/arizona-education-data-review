(function attachCorrelationEvidenceUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (!root) return;
  root.HeliosCorrelationEvidence = Object.freeze(api);
})(typeof window !== "undefined" ? window : null, function buildCorrelationEvidenceUtils() {
  const TOP_TIER_MAX_RANK = 15;
  const MID_TIER_MAX_RANK = 75;
  const SCOPE_NOTE = "Correlation strength and significance are from the latest statewide modeled run; county filters change displayed schools/outliers, not the modeled pair evidence metrics.";

  function toNumber(value) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeQualityBand(value) {
    return String(value || "").trim().toLowerCase();
  }

  function inferHighSignal(isHighSignalDefault, qualityBand) {
    if (typeof isHighSignalDefault === "boolean") return isHighSignalDefault;
    const normalized = normalizeQualityBand(qualityBand);
    return normalized === "high_signal_sparse_exception";
  }

  function strengthBandFromSpearman(spearmanR) {
    const rho = toNumber(spearmanR);
    if (rho == null) return { code: "unknown", label: "Unknown strength" };
    const abs = Math.abs(rho);
    if (abs < 0.2) return { code: "weak", label: "Weak" };
    if (abs < 0.4) return { code: "modest", label: "Modest" };
    if (abs < 0.6) return { code: "moderate", label: "Moderate" };
    return { code: "strong", label: "Strong" };
  }

  function significanceBandFromFdr(spearmanPCorrected) {
    const p = toNumber(spearmanPCorrected);
    if (p == null) return { code: "unknown", label: "Unknown significance" };
    if (p <= 0.01) return { code: "very_significant", label: "Very significant (FDR <= 0.01)" };
    if (p <= 0.05) return { code: "significant", label: "Significant (FDR <= 0.05)" };
    if (p <= 0.10) return { code: "suggestive", label: "Suggestive (FDR <= 0.10)" };
    return { code: "not_significant", label: "Not significant (FDR > 0.10)" };
  }

  function evidenceTier(input) {
    const nObs = toNumber(input?.nObs);
    const rho = toNumber(input?.spearmanR);
    const rSquared = toNumber(input?.rSquared);
    const p = toNumber(input?.spearmanPCorrected);
    const highSignal = inferHighSignal(input?.isHighSignalDefault, input?.qualityBand);
    const absRho = rho == null ? null : Math.abs(rho);

    if (
      nObs != null &&
      p != null &&
      p <= 0.05 &&
      nObs >= 150 &&
      (
        (absRho != null && absRho >= 0.4) ||
        (rSquared != null && rSquared >= 0.1) ||
        highSignal
      )
    ) {
      return { code: "strong_evidence", label: "Strong evidence" };
    }

    if (
      nObs != null &&
      p != null &&
      p <= 0.10 &&
      nObs >= 80 &&
      (
        (absRho != null && absRho >= 0.25) ||
        (rSquared != null && rSquared >= 0.05) ||
        highSignal
      )
    ) {
      return { code: "moderate_evidence", label: "Moderate evidence" };
    }

    return { code: "limited_evidence", label: "Limited evidence" };
  }

  function rankTierFromDefaultVisibilityRank(defaultVisibilityRank, isHighSignalDefault, qualityBand) {
    const rank = toNumber(defaultVisibilityRank);
    const highSignal = inferHighSignal(isHighSignalDefault, qualityBand);
    if (rank != null) {
      if (rank <= TOP_TIER_MAX_RANK) return { code: "top_tier", label: "Top-tier" };
      if (rank <= MID_TIER_MAX_RANK) return { code: "mid_tier", label: "Mid-tier" };
      return { code: "lower_tier", label: "Lower-tier" };
    }
    if (highSignal) return { code: "mid_tier", label: "Mid-tier" };
    return { code: "lower_tier", label: "Lower-tier" };
  }

  function buildEvidenceModel(input) {
    const model = input || {};
    const strengthBand = strengthBandFromSpearman(model.spearmanR);
    const significanceBand = significanceBandFromFdr(model.spearmanPCorrected);
    const evidence = evidenceTier(model);
    const rankTier = rankTierFromDefaultVisibilityRank(
      model.defaultVisibilityRank,
      model.isHighSignalDefault,
      model.qualityBand
    );
    return {
      strengthBand,
      significanceBand,
      evidenceTier: evidence,
      rankTier,
      scopeNote: SCOPE_NOTE
    };
  }

  function buildScatterStrengthCaption(input) {
    const rho = toNumber(input?.spearmanR);
    if (rho == null) return null;
    const significanceBand = significanceBandFromFdr(input?.spearmanPCorrected);
    const strengthBand = strengthBandFromSpearman(rho);
    const nObs = toNumber(input?.pairNObs ?? input?.nObs);
    const direction = rho < 0 ? "negative" : (rho > 0 ? "positive" : "flat");
    const significanceText = String(significanceBand.label || "Unknown significance")
      .replace(/^./, c => c.toLowerCase());
    const parts = [`rho=${rho.toFixed(3)}`];
    if (nObs != null) {
      parts.push(`n=${Math.round(nObs).toLocaleString("en-US")}`);
    }
    return `Correlation is ${direction} and ${significanceText}; strength is ${String(strengthBand.label || "Unknown strength").toLowerCase()} (${parts.join(", ")}).`;
  }

  return {
    buildEvidenceModel,
    buildScatterStrengthCaption,
    strengthBandFromSpearman,
    significanceBandFromFdr,
    rankTierFromDefaultVisibilityRank,
    scopeNote: SCOPE_NOTE
  };
});

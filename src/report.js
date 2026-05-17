import path from "node:path";

const SEVERITY_ORDER = {
  error: 0,
  warning: 1,
  info: 2
};

const SEVERITY_LABELS = {
  error: "error",
  warning: "warn",
  info: "info"
};

export function issue(input) {
  return {
    severity: input.severity,
    code: input.code,
    category: input.category,
    title: input.title,
    message: input.message,
    recommendation: input.recommendation,
    packageName: input.packageName,
    packagePath: input.packagePath,
    file: input.file,
    evidence: input.evidence
  };
}

export function createReport({ root, packages, issues, startedAt }) {
  const counts = {
    error: issues.filter((item) => item.severity === "error").length,
    warning: issues.filter((item) => item.severity === "warning").length,
    info: issues.filter((item) => item.severity === "info").length
  };

  return {
    tool: "release-doctor",
    version: "0.1.0",
    root,
    status: counts.error > 0 ? "fail" : counts.warning > 0 ? "warn" : "pass",
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    packages: packages.map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      path: pkg.relativePath || ".",
      private: Boolean(pkg.packageJson.private)
    })),
    counts,
    issues: [...issues].sort(sortIssues)
  };
}

export function formatReport(report, options = {}) {
  const rootLabel = options.root ? path.relative(options.root, report.root) || "." : report.root;
  const lines = [
    `Release Doctor ${report.status.toUpperCase()} for ${rootLabel}`,
    `${report.packages.length} package(s), ${report.counts.error} error(s), ${report.counts.warning} warning(s), ${report.counts.info} info`
  ];

  if (report.issues.length === 0) {
    lines.push("", "No release blockers detected.");
    return `${lines.join("\n")}\n`;
  }

  let currentPackage = "";
  for (const item of report.issues) {
    const packageLabel = item.packagePath || ".";
    if (packageLabel !== currentPackage) {
      currentPackage = packageLabel;
      lines.push("", packageLabel);
    }

    const location = item.file ? ` (${item.file})` : "";
    const evidence = item.evidence ? ` Evidence: ${item.evidence}` : "";
    lines.push(`  [${SEVERITY_LABELS[item.severity]}] ${item.code}: ${item.title}${location}`);
    lines.push(`    ${item.message}${evidence}`);
    if (item.recommendation) {
      lines.push(`    Fix: ${item.recommendation}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function sortIssues(left, right) {
  const severity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
  if (severity !== 0) return severity;

  const leftPath = left.packagePath || "";
  const rightPath = right.packagePath || "";
  if (leftPath !== rightPath) return leftPath.localeCompare(rightPath);

  return left.code.localeCompare(right.code);
}

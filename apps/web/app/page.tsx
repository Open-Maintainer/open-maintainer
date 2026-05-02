import type {
  GeneratedArtifact,
  Health,
  ModelProviderConfig,
  Repo,
  RepoProfile,
  ReviewResult,
  RunRecord,
} from "@open-maintainer/shared";
import { LocalRepoPicker } from "./LocalRepoPicker";

type SearchParams = Record<string, string | string[] | undefined>;

type DashboardProps = {
  searchParams?: Promise<SearchParams>;
};

type ProviderSummary = Omit<ModelProviderConfig, "encryptedApiKey"> & {
  encryptedApiKey?: string;
};

type ReadinessProfile = RepoProfile & {
  readiness?: {
    score?: unknown;
    missingItems?: unknown;
    missing?: unknown;
  };
  readinessScore?: unknown;
  missingItems?: unknown;
  readinessMissingItems?: unknown;
};

type RunWithContext = RunRecord & {
  contextPr?: {
    prUrl?: unknown;
  };
  context?: {
    prUrl?: unknown;
    pullRequestUrl?: unknown;
  };
  prUrl?: unknown;
};

const serverApiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const response = await fetch(`${serverApiBaseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default async function Dashboard({ searchParams }: DashboardProps) {
  const params: SearchParams = searchParams ? await searchParams : {};
  const requestedRepo = singleParam(params.repo ?? params.repoId);
  const repoQuery = singleParam(params.q)?.trim().toLowerCase() ?? "";
  const localRepoError = singleParam(params.localRepoError);
  const actionError = singleParam(params.actionError);
  const providerError = singleParam(params.providerError);
  const requestedProviderId = singleParam(params.providerId);

  const [health, reposResponse, providersResponse] = await Promise.all([
    fetchJson<Health>("/health"),
    fetchJson<{ repos: Repo[] }>("/repos"),
    fetchJson<{ providers: ProviderSummary[] }>("/model-providers"),
  ]);
  const repos = reposResponse?.repos ?? [];
  const repo = selectRepo({ repos, requestedRepo, repoQuery });
  const profileResponse = repo
    ? await fetchJson<{ profile: ReadinessProfile }>(
        `/repos/${repo.id}/profile`,
      )
    : null;
  const artifactsResponse = repo
    ? await fetchJson<{ artifacts: GeneratedArtifact[] }>(
        `/repos/${repo.id}/artifacts`,
      )
    : null;
  const runsResponse = repo
    ? await fetchJson<{ runs: RunWithContext[] }>(`/repos/${repo.id}/runs`)
    : null;
  const reviewsResponse = repo
    ? await fetchJson<{ reviews: ReviewResult[] }>(`/repos/${repo.id}/reviews`)
    : null;
  const profile = profileResponse?.profile ?? null;
  const artifacts = artifactsResponse?.artifacts ?? [];
  const runs = runsResponse?.runs ?? [];
  const reviews = reviewsResponse?.reviews ?? [];
  const latestReview = reviews.at(-1) ?? null;
  const providers = providersResponse?.providers ?? [];
  const selectedProvider =
    providers.find((provider) => provider.id === requestedProviderId) ??
    providers.find((provider) => provider.repoContentConsent) ??
    null;
  const defaultArtifactSelection =
    artifactSelectionForProvider(selectedProvider);
  const readiness = profile ? getReadiness(profile) : null;
  const prStatus = getPrStatus(runs);
  const contextActionLabel =
    repo?.owner === "local" ? "Open PR with gh" : "Open context PR";

  return (
    <main>
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="muted">Self-hosted context PR workflow</p>
            <h1>Open Maintainer</h1>
          </div>
          <span className={health?.status === "ok" ? "badge" : "badge warn"}>
            {health?.status ?? "setup needed"}
          </span>
        </header>

        <section className="grid" aria-label="Service health">
          <StatusCard label="API" value={health?.api} />
          <StatusCard label="Postgres" value={health?.database} />
          <StatusCard label="Redis" value={health?.redis} />
          <StatusCard label="Worker" value={health?.worker} />
        </section>

        <section className="columns">
          <div className="panel">
            <div className="panel-heading">
              <h2>Repository</h2>
              <span className="count">{repos.length} installed</span>
            </div>
            <LocalRepoPicker error={localRepoError} />
            {repos.length ? (
              <div className="repo-links" aria-label="Installed repos">
                {repos.map((installedRepo) => (
                  <a
                    className={
                      installedRepo.id === repo?.id
                        ? "repo-link active"
                        : "repo-link"
                    }
                    href={`/?repo=${encodeURIComponent(installedRepo.id)}`}
                    key={installedRepo.id}
                  >
                    {installedRepo.fullName}
                  </a>
                ))}
              </div>
            ) : null}
            {repo ? (
              <div className="list">
                <div className="row">
                  <div>
                    <strong>{repo.fullName}</strong>
                    <p className="muted">
                      Default branch: {repo.defaultBranch}
                    </p>
                  </div>
                  <span className="badge">
                    {repo.private ? "private" : "public"}
                  </span>
                </div>
                <div className="actions">
                  <form action="/repo-actions" method="post">
                    <input type="hidden" name="repoId" value={repo.id} />
                    <input type="hidden" name="actionType" value="analyze" />
                    <button type="submit">Run analysis</button>
                  </form>
                  <form action="/repo-actions" method="post">
                    <input type="hidden" name="repoId" value={repo.id} />
                    <input
                      type="hidden"
                      name="actionType"
                      value="generateContext"
                    />
                    {selectedProvider ? (
                      <input
                        type="hidden"
                        name="providerId"
                        value={selectedProvider.id}
                      />
                    ) : null}
                    <div className="generate-options">
                      <label>
                        <span>Context</span>
                        <select
                          name="context"
                          defaultValue={defaultArtifactSelection}
                        >
                          <option value="codex">Codex</option>
                          <option value="claude">Claude</option>
                          <option value="both">Both</option>
                        </select>
                      </label>
                      <label>
                        <span>Skills</span>
                        <select
                          name="skills"
                          defaultValue={defaultArtifactSelection}
                        >
                          <option value="codex">Codex</option>
                          <option value="claude">Claude</option>
                          <option value="both">Both</option>
                        </select>
                      </label>
                    </div>
                    <button type="submit">Generate context</button>
                  </form>
                  <form action="/repo-actions" method="post">
                    <input type="hidden" name="repoId" value={repo.id} />
                    <input
                      type="hidden"
                      name="actionType"
                      value="openContextPr"
                    />
                    <button type="submit">{contextActionLabel}</button>
                  </form>
                </div>
                {actionError ? (
                  <p className="error">{actionErrorMessage(actionError)}</p>
                ) : null}
              </div>
            ) : (
              <SetupMessage />
            )}
          </div>

          <div className="panel">
            <div className="panel-heading">
              <h2>Provider Consent</h2>
              <span
                className={
                  providers.some((provider) => provider.repoContentConsent)
                    ? "badge"
                    : "badge warn"
                }
              >
                {providers.some((provider) => provider.repoContentConsent)
                  ? "ready"
                  : "blocked"}
              </span>
            </div>
            <form
              action="/provider-actions"
              className="provider-form"
              method="post"
            >
              {repo ? (
                <input type="hidden" name="repoId" value={repo.id} />
              ) : null}
              <label htmlFor="providerType">Provider</label>
              <select
                id="providerType"
                name="providerType"
                defaultValue="codex"
              >
                <option value="codex">Codex CLI</option>
                <option value="claude">Claude CLI</option>
              </select>
              <label htmlFor="providerModel">Model</label>
              <input
                id="providerModel"
                name="model"
                placeholder="Provider default"
                type="text"
              />
              <label className="checkbox-row">
                <input name="repoContentConsent" type="checkbox" />
                <span>Allow repository content for generation</span>
              </label>
              <button type="submit">Use provider</button>
              {providerError ? (
                <p className="error">{providerErrorMessage(providerError)}</p>
              ) : null}
            </form>
            {providers.length ? (
              <div className="list">
                {providers.map((provider) => (
                  <div className="row compact" key={provider.id}>
                    <div>
                      <strong>{provider.displayName}</strong>
                      <p className="muted">
                        {provider.kind} / {provider.model}
                      </p>
                    </div>
                    <div className="row-actions">
                      <span
                        className={
                          provider.repoContentConsent ? "badge" : "badge warn"
                        }
                      >
                        {provider.repoContentConsent
                          ? provider.id === selectedProvider?.id
                            ? "selected"
                            : "consented"
                          : "no consent"}
                      </span>
                      {provider.id !== selectedProvider?.id ? (
                        <form action="/provider-actions" method="post">
                          {repo ? (
                            <input
                              type="hidden"
                              name="repoId"
                              value={repo.id}
                            />
                          ) : null}
                          <input
                            type="hidden"
                            name="providerId"
                            value={provider.id}
                          />
                          <button type="submit">Use</button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                No model provider is configured. Generation is blocked until a
                provider exists and repo-content consent is enabled.
              </p>
            )}
            <p className="note">
              Connectivity tests use a harmless non-repo prompt.
            </p>
          </div>
        </section>

        <section className="columns" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-heading">
              <h2>Repo Profile</h2>
              {profile ? (
                <span className="badge">v{profile.version}</span>
              ) : null}
            </div>
            {profile ? (
              <div className="profile-stack">
                <div className="metric-row">
                  <div className="metric">
                    <span className="metric-label">Readiness</span>
                    <strong>{formatReadinessScore(readiness?.score)}</strong>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Package manager</span>
                    <strong>{profile.packageManager ?? "unknown"}</strong>
                  </div>
                </div>
                {readiness?.missingItems.length ? (
                  <div>
                    <h3>Missing items</h3>
                    <ul className="plain-list">
                      {readiness.missingItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : readiness?.score === undefined ? (
                  <p className="muted">
                    Readiness score has not been populated by the backend yet.
                  </p>
                ) : (
                  <p className="muted">No missing readiness items reported.</p>
                )}
                <div className="profile-facts">
                  <FactList
                    label="Languages"
                    values={profile.primaryLanguages}
                  />
                  <FactList label="Frameworks" values={profile.frameworks} />
                  <FactList
                    label="Risk areas"
                    values={profile.detectedRiskAreas}
                  />
                </div>
              </div>
            ) : (
              <p className="muted">Run analysis to create repo_profile:v1.</p>
            )}
          </div>
          <div className="panel">
            <div className="panel-heading">
              <h2>Artifacts</h2>
              <span className="count">{artifacts.length} generated</span>
            </div>
            {artifacts.length ? (
              <div className="artifact-list">
                {artifacts.map((artifact) => (
                  <div className="artifact" key={artifact.id}>
                    <div className="row compact">
                      <div>
                        <strong>{artifact.type}</strong>
                        <p className="muted">
                          v{artifact.version} from profile v
                          {artifact.sourceProfileVersion}
                        </p>
                      </div>
                      <span className="badge">preview</span>
                    </div>
                    <pre className="artifact-preview">{artifact.content}</pre>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                Generate context to preview AGENTS.md and .open-maintainer.yml.
              </p>
            )}
          </div>
        </section>

        <section className="columns" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-heading">
              <h2>PR Review</h2>
              <span className={latestReview ? "badge" : "badge warn"}>
                {latestReview ? latestReview.mergeReadiness.status : "preview"}
              </span>
            </div>
            {repo ? (
              <form
                action="/repo-actions"
                className="provider-form"
                method="post"
              >
                <input type="hidden" name="repoId" value={repo.id} />
                <input type="hidden" name="actionType" value="createReview" />
                {selectedProvider ? (
                  <input
                    type="hidden"
                    name="providerId"
                    value={selectedProvider.id}
                  />
                ) : null}
                <label htmlFor="baseRef">Base ref</label>
                <input
                  id="baseRef"
                  name="baseRef"
                  placeholder={repo.defaultBranch}
                  type="text"
                />
                <label htmlFor="headRef">Head ref</label>
                <input
                  id="headRef"
                  name="headRef"
                  placeholder="HEAD"
                  type="text"
                />
                <label htmlFor="prNumber">PR number</label>
                <input
                  id="prNumber"
                  inputMode="numeric"
                  name="prNumber"
                  placeholder="optional"
                  type="text"
                />
                <button type="submit">Preview review</button>
              </form>
            ) : (
              <p className="muted">Select a repository before reviewing.</p>
            )}
            {latestReview ? <ReviewPreview review={latestReview} /> : null}
          </div>
          <div className="panel">
            <div className="panel-heading">
              <h2>Context PR</h2>
              <span className={prStatus.url ? "badge" : "badge warn"}>
                {prStatus.label}
              </span>
            </div>
            {prStatus.url ? (
              <a className="pr-link" href={prStatus.url}>
                {prStatus.url}
              </a>
            ) : (
              <p className="muted">{prStatus.message}</p>
            )}
          </div>
          <div className="panel">
            <div className="panel-heading">
              <h2>Run History</h2>
              <span className="count">{runs.length} runs</span>
            </div>
            {runs.length ? (
              <div className="list">
                {runs
                  .slice()
                  .reverse()
                  .slice(0, 8)
                  .map((run) => (
                    <div className="run" key={run.id}>
                      <div className="run-title">
                        <strong>{run.type}</strong>
                        <span
                          className={
                            run.status === "failed" ? "badge warn" : "badge"
                          }
                        >
                          {run.status}
                        </span>
                      </div>
                      <p
                        className={run.status === "failed" ? "error" : "muted"}
                      >
                        {run.safeMessage ?? run.inputSummary}
                      </p>
                      <dl className="run-meta">
                        <div>
                          <dt>Updated</dt>
                          <dd>{formatDate(run.updatedAt)}</dd>
                        </div>
                        <div>
                          <dt>Provider</dt>
                          <dd>{formatProvider(run)}</dd>
                        </div>
                        <div>
                          <dt>External</dt>
                          <dd>{formatExternal(run)}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="muted">
                Run records will appear before external work starts and after
                each state transition.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ReviewPreview({ review }: { review: ReviewResult }) {
  const findingsBySeverity = ["blocker", "major", "minor", "note"].map(
    (severity) => ({
      severity,
      findings: review.findings.filter(
        (finding) => finding.severity === severity,
      ),
    }),
  );
  return (
    <div className="artifact-list">
      <div className="artifact">
        <div className="row compact">
          <div>
            <strong>Review #{review.prNumber ?? "local"}</strong>
            <p className="muted">
              {review.baseRef}...{review.headRef}
            </p>
          </div>
          <span className="badge">
            {review.modelProvider ?? "deterministic"}
          </span>
        </div>
        <p>{review.summary}</p>
        <h3>Changed surface</h3>
        <ul className="plain-list">
          {review.changedSurface.map((surface) => (
            <li key={surface}>{surface}</li>
          ))}
        </ul>
        <h3>Expected validation</h3>
        <ul className="plain-list">
          {review.expectedValidation.length ? (
            review.expectedValidation.map((item) => (
              <li key={item.command}>{item.command}</li>
            ))
          ) : (
            <li>No expected validation inferred.</li>
          )}
        </ul>
        <h3>Findings</h3>
        {findingsBySeverity.map(({ severity, findings }) =>
          findings.length ? (
            <div key={severity}>
              <strong>{severity}</strong>
              <ul className="plain-list">
                {findings.map((finding) => (
                  <li key={finding.id}>
                    {finding.title}
                    {finding.path ? ` (${finding.path})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
        <h3>Docs impact</h3>
        <ul className="plain-list">
          {review.docsImpact.length ? (
            review.docsImpact.map((impact) => (
              <li key={impact.path}>
                {impact.path}: {impact.reason}
              </li>
            ))
          ) : (
            <li>No docs impact detected.</li>
          )}
        </ul>
        <h3>Merge readiness</h3>
        <p>{review.mergeReadiness.reason}</p>
        <h3>Residual risk</h3>
        <ul className="plain-list">
          {review.residualRisk.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function selectRepo({
  repos,
  requestedRepo,
  repoQuery,
}: {
  repos: Repo[];
  requestedRepo: string | undefined;
  repoQuery: string;
}): Repo | null {
  if (requestedRepo) {
    const match = repos.find(
      (repo) =>
        repo.id === requestedRepo ||
        repo.fullName === requestedRepo ||
        repo.name === requestedRepo,
    );
    if (match) {
      return match;
    }
  }
  if (repoQuery) {
    return (
      repos.find((repo) => repo.fullName.toLowerCase().includes(repoQuery)) ??
      null
    );
  }
  return null;
}

function getReadiness(profile: ReadinessProfile): {
  score: number | undefined;
  missingItems: string[];
} {
  const readiness = profile.readiness;
  const agentReadiness = profile.agentReadiness;
  return {
    score: numberValue(
      profile.readinessScore ?? readiness?.score ?? agentReadiness.score,
    ),
    missingItems: stringArray(
      profile.missingItems ??
        profile.readinessMissingItems ??
        readiness?.missingItems ??
        readiness?.missing ??
        agentReadiness.missingItems,
    ),
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function formatReadinessScore(score: number | undefined): string {
  if (score === undefined) {
    return "pending";
  }
  return score <= 1 ? `${Math.round(score * 100)}%` : `${Math.round(score)}`;
}

function actionErrorMessage(error: string): string {
  const parsed = parseStatusError(error);
  if (error === "invalid-action") {
    return "That repository action was not recognized.";
  }
  if (error === "unreachable") {
    return "The API did not respond to that repository action.";
  }
  if (error === "409") {
    return "That action needs analysis artifacts or provider consent first.";
  }
  return parsed.detail
    ? `Repository action failed with API status ${parsed.status}. ${parsed.detail}`
    : `Repository action failed with API status ${parsed.status}.`;
}

function providerErrorMessage(error: string): string {
  const parsed = parseStatusError(error);
  if (error === "invalid-provider") {
    return "Choose Codex CLI or Claude CLI.";
  }
  if (error === "missing-consent") {
    return "Repo-content consent is required before generation can use a provider.";
  }
  if (error === "unreachable") {
    return "The API did not respond while saving the provider.";
  }
  return parsed.detail
    ? `Provider setup failed with API status ${parsed.status}. ${parsed.detail}`
    : `Provider setup failed with API status ${parsed.status}.`;
}

function parseStatusError(error: string): { status: string; detail: string } {
  const separator = error.indexOf(":");
  if (separator < 0) {
    return { status: error, detail: "" };
  }
  return {
    status: error.slice(0, separator),
    detail: error.slice(separator + 1),
  };
}

function artifactSelectionForProvider(
  provider: ProviderSummary | null,
): "codex" | "claude" {
  return provider?.kind === "claude-cli" ? "claude" : "codex";
}

function getPrStatus(runs: RunWithContext[]): {
  label: string;
  message: string;
  url: string | null;
} {
  const contextRuns = runs
    .filter((run) => run.type === "context_pr")
    .slice()
    .reverse();
  const runWithUrl = contextRuns.find((run) => findPrUrl(run));
  const url = runWithUrl ? findPrUrl(runWithUrl) : null;
  if (url) {
    return { label: "opened", message: "Context PR opened.", url };
  }
  const latest = contextRuns[0];
  if (!latest) {
    return {
      label: "not opened",
      message:
        "Open a context PR after artifacts have been generated. Local repositories use the authenticated gh CLI in the API environment.",
      url: null,
    };
  }
  return {
    label: latest.status,
    message:
      latest.safeMessage ??
      (latest.status === "succeeded"
        ? "Context PR run succeeded, but no PR URL was returned."
        : latest.inputSummary),
    url: null,
  };
}

function findPrUrl(run: RunWithContext): string | null {
  const candidates = [
    run.externalId,
    run.prUrl,
    run.contextPr?.prUrl,
    run.context?.prUrl,
    run.context?.pullRequestUrl,
  ];
  const url = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" &&
      /^https?:\/\/\S+\/pull\/\d+/.test(candidate),
  );
  return url ?? null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatProvider(run: RunRecord): string {
  return run.provider && run.model ? `${run.provider} / ${run.model}` : "none";
}

function formatExternal(run: RunWithContext): string {
  return findPrUrl(run) ?? run.externalId ?? "none";
}

function FactList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <h3>{label}</h3>
      <p className="muted">{values.length ? values.join(", ") : "none"}</p>
    </div>
  );
}

function StatusCard({
  label,
  value,
}: { label: string; value: string | undefined }) {
  return (
    <div className="panel status">
      <strong>{label}</strong>
      <span className={value === "ok" ? "badge" : "badge warn"}>
        {value ?? "missing"}
      </span>
    </div>
  );
}

function SetupMessage() {
  return (
    <div>
      <p className="muted">
        Choose a local repository or select an installed repository.
      </p>
    </div>
  );
}

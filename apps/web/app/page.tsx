import type {
  GeneratedArtifact,
  Health,
  Repo,
  RepoProfile,
  RunRecord,
} from "@open-maintainer/shared";

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
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

export default async function Dashboard() {
  const health = await fetchJson<Health>("/health");
  const reposResponse = await fetchJson<{ repos: Repo[] }>("/repos");
  const repo = reposResponse?.repos[0] ?? null;
  const profileResponse = repo
    ? await fetchJson<{ profile: RepoProfile }>(`/repos/${repo.id}/profile`)
    : null;
  const artifactsResponse = repo
    ? await fetchJson<{ artifacts: GeneratedArtifact[] }>(
        `/repos/${repo.id}/artifacts`,
      )
    : null;
  const runsResponse = repo
    ? await fetchJson<{ runs: RunRecord[] }>(`/repos/${repo.id}/runs`)
    : null;

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
            <h2>Repository</h2>
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
                  <form
                    action={`${apiBaseUrl}/repos/${repo.id}/analyze`}
                    method="post"
                  >
                    <button type="submit">Run analysis</button>
                  </form>
                  <form
                    action={`${apiBaseUrl}/repos/${repo.id}/generate-context`}
                    method="post"
                  >
                    <button type="submit">Generate context</button>
                  </form>
                  <form
                    action={`${apiBaseUrl}/repos/${repo.id}/open-context-pr`}
                    method="post"
                  >
                    <button type="submit">Open context PR</button>
                  </form>
                </div>
              </div>
            ) : (
              <SetupMessage />
            )}
          </div>

          <div className="panel">
            <h2>Provider Consent</h2>
            <p className="muted">
              Generation remains blocked until a provider is configured and
              repo-content consent is enabled. Connectivity tests use a harmless
              non-repo prompt.
            </p>
          </div>
        </section>

        <section className="columns" style={{ marginTop: 16 }}>
          <div className="panel">
            <h2>Repo Profile</h2>
            {profileResponse?.profile ? (
              <pre>{JSON.stringify(profileResponse.profile, null, 2)}</pre>
            ) : (
              <p className="muted">Run analysis to create repo_profile:v1.</p>
            )}
          </div>
          <div className="panel">
            <h2>Artifacts</h2>
            {artifactsResponse?.artifacts?.length ? (
              <div className="list">
                {artifactsResponse.artifacts.map((artifact) => (
                  <div className="row" key={artifact.id}>
                    <div>
                      <strong>{artifact.type}</strong>
                      <p className="muted">
                        v{artifact.version} from profile v
                        {artifact.sourceProfileVersion}
                      </p>
                    </div>
                    <span className="badge">preview</span>
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

        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Run History</h2>
          {runsResponse?.runs?.length ? (
            <div className="list">
              {runsResponse.runs.slice(-8).map((run) => (
                <div className="row" key={run.id}>
                  <div>
                    <strong>{run.type}</strong>
                    <p className="muted">
                      {run.safeMessage ?? run.inputSummary}
                    </p>
                  </div>
                  <span
                    className={run.status === "failed" ? "badge warn" : "badge"}
                  >
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              Run records will appear before external work starts and after each
              state transition.
            </p>
          )}
        </section>
      </div>
    </main>
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
        Configure the GitHub App and install it on selected repositories.
        Missing credentials, webhook failures, and provider consent blocks are
        surfaced in this dashboard and API run history.
      </p>
    </div>
  );
}

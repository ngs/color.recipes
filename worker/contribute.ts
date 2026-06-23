// Write proxy (SPEC §8): list fork owners, check a fork target, and the full
// fork -> branch -> commit -> PR flow. Everything uses the contributor's token.
import type { Env } from "./env.ts";
import { validateScheme, validateRepoName, slugify } from "../src/validate.ts";
import { json, toBase64, sleep } from "./util.ts";
import { gh, ghError } from "./github.ts";
import { currentToken } from "./auth.ts";

interface SubmitBody {
  scheme?: unknown;
  forkName?: unknown;
  forkOwner?: unknown;
}

// GET /api/fork/owners — accounts the contributor can fork into: themselves plus
// the organizations they belong to (mirrors GitHub's "Create a new fork" list).
export async function forkOwners(request: Request, env: Env): Promise<Response> {
  const token = await currentToken(request, env);
  if (!token) return json({ error: "not authenticated" }, 401);

  const meRes = await gh(token, "GET", "/user");
  if (!meRes.ok) return json({ error: "not authenticated" }, 401);
  const me = (await meRes.json()) as { login: string; avatar_url: string };

  const owners: Array<{ login: string; type: string; avatarUrl: string; canCreate: boolean }> = [
    { login: me.login, type: "User", avatarUrl: me.avatar_url, canCreate: true },
  ];

  const memRes = await gh(token, "GET", "/user/memberships/orgs?state=active&per_page=100");
  if (memRes.ok) {
    const memberships = (await memRes.json()) as Array<{
      role: string;
      organization: { login: string; avatar_url: string };
    }>;
    const orgOwners = await Promise.all(
      memberships.map(async (m) => {
        // Admins can always create; for members, a fork of a public repo is public,
        // so the org's public-repo creation policy decides.
        let canCreate = m.role === "admin";
        if (!canCreate) {
          const orgRes = await gh(token, "GET", `/orgs/${m.organization.login}`);
          if (orgRes.ok) {
            const org = (await orgRes.json()) as {
              members_can_create_public_repositories?: boolean;
              members_can_create_repositories?: boolean;
            };
            canCreate =
              org.members_can_create_public_repositories ?? org.members_can_create_repositories ?? true;
          } else {
            canCreate = true; // policy not readable — stay optimistic
          }
        }
        return {
          login: m.organization.login,
          type: "Organization",
          avatarUrl: m.organization.avatar_url,
          canCreate,
        };
      }),
    );
    owners.push(...orgOwners);
  }

  return json({ login: me.login, owners });
}

// GET /api/fork/check?owner=<owner>&name=<name> — is <owner>/<name> usable as a
// fork target? Returns { valid, exists, available, isOurFork, isUpstream }
// (owner defaults to the logged-in user). isUpstream/isOurFork mean reuse as-is.
export async function forkCheck(request: Request, env: Env, url: URL): Promise<Response> {
  const token = await currentToken(request, env);
  if (!token) return json({ error: "not authenticated" }, 401);

  const nameResult = validateRepoName(url.searchParams.get("name") ?? "");
  if (!nameResult.ok) return json({ valid: false, errors: nameResult.errors }, 400);
  const name = nameResult.value;

  const meRes = await gh(token, "GET", "/user");
  if (!meRes.ok) return json({ error: "not authenticated" }, 401);
  const me = (await meRes.json()) as { login: string };
  const owner = url.searchParams.get("owner") || me.login;

  const repoRes = await gh(token, "GET", `/repos/${owner}/${name}`);
  if (repoRes.status === 404) {
    return json({ valid: true, exists: false, available: true, isOurFork: false, isUpstream: false });
  }
  if (!repoRes.ok) return json({ error: `could not check repository (${repoRes.status})` }, 502);
  const repo = (await repoRes.json()) as { fork?: boolean; parent?: { full_name?: string } };
  const upstream = env.UPSTREAM_REPO.toLowerCase();
  const isUpstream = `${owner}/${name}`.toLowerCase() === upstream;
  const isOurFork = !!repo.fork && repo.parent?.full_name?.toLowerCase() === upstream;
  return json({ valid: true, exists: true, available: false, isOurFork, isUpstream });
}

export async function submit(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const token = await currentToken(request, env);
  if (!token) return json({ error: "not authenticated" }, 401);

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const result = validateScheme(body.scheme);
  if (!result.ok) return json({ error: result.errors.join("; ") }, 400);
  const scheme = result.value;

  const [upstreamOwner, upstreamRepo] = env.UPSTREAM_REPO.split("/");
  const slug = slugify(scheme.name);
  const path = `schemes/${slug}.json`;
  const content = JSON.stringify(scheme, null, 2) + "\n";

  // 1. Who am I.
  const meRes = await gh(token, "GET", "/user");
  if (!meRes.ok) return json({ error: "could not read GitHub user" }, 502);
  const me = (await meRes.json()) as { login: string };

  // 2. Upstream default branch.
  const upstreamRes = await gh(token, "GET", `/repos/${upstreamOwner}/${upstreamRepo}`);
  const upstream = (await upstreamRes.json()) as { default_branch: string };
  const baseBranch = upstream.default_branch;

  // 3. Resolve where the branch lives. The contributor chooses the target owner
  //    (themselves or an org) and name. The upstream repo itself can't be forked,
  //    so when the target IS the upstream we commit a branch there directly; for
  //    an org target we fork into the org; otherwise a personal fork. We read the
  //    actual owner/name back so a collision never hits the wrong repo.
  let forkName = upstreamRepo;
  if (body.forkName != null) {
    const nameResult = validateRepoName(body.forkName);
    if (!nameResult.ok) return json({ error: nameResult.errors.join("; ") }, 400);
    forkName = nameResult.value;
  }
  const targetOwner = typeof body.forkOwner === "string" && body.forkOwner ? body.forkOwner : me.login;

  let forkOwner = upstreamOwner;
  let forkRepo = upstreamRepo;
  const targetIsUpstream =
    targetOwner.toLowerCase() === upstreamOwner.toLowerCase() &&
    forkName.toLowerCase() === upstreamRepo.toLowerCase();
  if (!targetIsUpstream) {
    const forkBody: Record<string, unknown> = { name: forkName, default_branch_only: true };
    if (targetOwner.toLowerCase() !== me.login.toLowerCase()) forkBody.organization = targetOwner;
    const forkRes = await gh(token, "POST", `/repos/${upstreamOwner}/${upstreamRepo}/forks`, forkBody);
    if (!forkRes.ok) return json({ error: await ghError(forkRes, "create fork") }, 502);
    const fork = (await forkRes.json()) as { name: string; owner: { login: string } };
    forkOwner = fork.owner.login;
    forkRepo = fork.name;
  }

  // 4. Base SHA from the fork (retry: a freshly created fork may not be ready).
  const baseSha = await forkBaseSha(token, forkOwner, forkRepo, baseBranch);
  if (!baseSha) return json({ error: "fork not ready yet — please retry in a moment" }, 503);

  // 5. New branch.
  const branch = `add-${slug}-${Date.now().toString(36)}`;
  const refRes = await gh(token, "POST", `/repos/${forkOwner}/${forkRepo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });
  if (!refRes.ok) return json({ error: await ghError(refRes, "create branch") }, 502);

  // 6. Commit the scheme file to the branch.
  const putRes = await gh(token, "PUT", `/repos/${forkOwner}/${forkRepo}/contents/${path}`, {
    message: `Add scheme: ${scheme.name}`,
    content: toBase64(content),
    branch,
  });
  if (!putRes.ok) return json({ error: await ghError(putRes, "commit file") }, 502);

  // 7. Open the PR against upstream. The body shows a swatch per color (rendered
  // via placehold.co, since GitHub markdown can't fill a color box otherwise).
  const swatches = scheme.colors
    .map((hex) => {
      const h = hex.replace(/^#/, "");
      return `- ![${hex}](https://placehold.co/15x15/${h}/${h}.png) \`${hex}\``;
    })
    .join("\n");
  const prRes = await gh(token, "POST", `/repos/${upstreamOwner}/${upstreamRepo}/pulls`, {
    title: `Add scheme: ${scheme.name}`,
    head: `${forkOwner}:${branch}`,
    base: baseBranch,
    body: `Adds \`${path}\` via color.recipes.\n\n**Colors**\n\n${swatches}\n\n**Tags:** ${scheme.tags.join(", ")}`,
    maintainer_can_modify: true,
  });
  if (!prRes.ok) return json({ error: await ghError(prRes, "open PR") }, 502);
  const pr = (await prRes.json()) as { html_url: string };
  return json({ url: pr.html_url });
}

async function forkBaseSha(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await gh(token, "GET", `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    if (res.ok) {
      const ref = (await res.json()) as { object: { sha: string } };
      return ref.object.sha;
    }
    // Fork still propagating; brief backoff.
    await sleep(700 * (attempt + 1));
  }
  return null;
}

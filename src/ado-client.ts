import * as https from 'https';
import * as url from 'url';

export interface AdoProjectConfig {
  name: string;
  enabled: boolean;
}

export interface AdoWorkItem {
  id: number;
  title: string;
  state: string;
  type: string;
  url: string;
  assignedTo: string;
  areaPath: string;
  tags: string[];
  parentId?: number;
  project: string;
}

export interface AdoPR {
  id: number;
  title: string;
  status: string;
  isDraft: boolean;
  sourceRef: string;
  targetRef: string;
  url: string;
  repository: string;
  reviewers: string[];
  createdBy: string;
  reviewerVotes?: Map<string, number>; // uniqueName -> vote (-10=rejected, -5=waiting, 0=no vote, 5=approved with suggestions, 10=approved)
  project: string;
}

export interface AdoIdentity {
  displayName: string;
  uniqueName: string;
}

function adoFetch<T>(apiUrl: string, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(apiUrl);
    const isPat = !token.startsWith('eyJ');
    const authHeader = isPat
      ? `Basic ${Buffer.from(':' + token).toString('base64')}`
      : `Bearer ${token}`;

    const req = https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
        timeout: 15000,
      },
      res => {
        if (res.statusCode !== 200) {
          res.resume(); // drain response to free socket
          reject(new Error(`ADO API returned ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (err) { reject(err); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ADO API timeout')); });
  });
}

function normalizeOrg(org: string): string {
  return org.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^dev\.azure\.com\//, '');
}

function postWiql(apiUrl: string, token: string, wiql: string): Promise<number[]> {
  return new Promise<number[]>((resolve, reject) => {
    const parsed = new url.URL(apiUrl);
    const isPat = !token.startsWith('eyJ');
    const authHeader = isPat
      ? `Basic ${Buffer.from(':' + token).toString('base64')}`
      : `Bearer ${token}`;

    const body = JSON.stringify({ query: wiql });

    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 15000,
      },
      res => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`WIQL returned ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try {
            interface WiqlResult { workItems: Array<{ id: number }> }
            const result: WiqlResult = JSON.parse(data);
            resolve(result.workItems?.map(wi => wi.id) ?? []);
          } catch (err) { reject(err); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('WIQL timeout')); });
    req.write(body);
    req.end();
  });
}

export async function fetchAdoWorkItems(
  org: string,
  project: string,
  token: string,
  limit: number = 200,
): Promise<AdoWorkItem[]> {
  const orgName = normalizeOrg(org);
  const wiqlUrl = `https://dev.azure.com/${orgName}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.1&$top=${limit}`;

  const recentQuery = `SELECT [System.Id] FROM WorkItems WHERE [System.State] IN ('Active', 'New', 'Doing', 'Closed', 'Resolved', 'Removed') ORDER BY [System.ChangedDate] DESC`;
  const myQuery = `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @me ORDER BY [System.ChangedDate] DESC`;

  let ids: number[];
  try {
    const [recentIds, myIds] = await Promise.all([
      postWiql(wiqlUrl, token, recentQuery).catch(err => {
        console.error(`[EditLess] Recent WIQL query failed for ${orgName}/${project}:`, err);
        return null;
      }),
      postWiql(wiqlUrl, token, myQuery).catch(err => {
        console.error(`[EditLess] Assigned-to-me WIQL query failed for ${orgName}/${project}:`, err);
        return null;
      }),
    ]);
    if (recentIds === null && myIds === null) return [];

    const seen = new Set<number>();
    for (const id of recentIds ?? []) seen.add(id);
    for (const id of myIds ?? []) seen.add(id);
    ids = [...seen].slice(0, limit);
  } catch (err) {
    console.error(`[EditLess] WIQL processing failed for ${orgName}/${project}:`, err);
    return [];
  }

  if (ids.length === 0) return [];

  // Fetch work item details in batches (ADO API supports max 200 per batch)
  const batchSize = 200;
  const allWorkItems: AdoWorkItem[] = [];
  
  for (let i = 0; i < ids.length; i += batchSize) {
    const batchIds = ids.slice(i, i + batchSize);
    const detailsUrl = `https://dev.azure.com/${orgName}/${encodeURIComponent(project)}/_apis/wit/workitems?ids=${batchIds.join(',')}&fields=System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo,System.AreaPath,System.Tags,System.Parent&api-version=7.1`;

    interface WorkItemDetail {
      id: number;
      fields: Record<string, unknown>;
      _links: { html: { href: string } };
    }
    interface BatchResponse { value: WorkItemDetail[] }

    try {
      const batch = await adoFetch<BatchResponse>(detailsUrl, token);
      allWorkItems.push(...batch.value.map(wi => ({
        id: wi.id,
        title: (wi.fields['System.Title'] as string) ?? '',
        state: (wi.fields['System.State'] as string) ?? '',
        type: (wi.fields['System.WorkItemType'] as string) ?? '',
        url: wi._links?.html?.href ?? `https://dev.azure.com/${orgName}/${encodeURIComponent(project)}/_workitems/edit/${wi.id}`,
        assignedTo: ((wi.fields['System.AssignedTo'] as { displayName?: string })?.displayName) ?? '',
        areaPath: (wi.fields['System.AreaPath'] as string) ?? '',
        tags: ((wi.fields['System.Tags'] as string) ?? '').split(';').map(t => t.trim()).filter(Boolean),
        parentId: (wi.fields['System.Parent'] as number) ?? undefined,
        project,
      })));
    } catch (err) {
      console.error(`[EditLess] Batch fetch failed for IDs ${batchIds[0]}–${batchIds[batchIds.length - 1]}:`, err);
    }
  }
  
  return allWorkItems;
}

export async function fetchAdoPRs(
  org: string,
  project: string,
  token: string,
): Promise<AdoPR[]> {
  const orgName = normalizeOrg(org);

  // First discover repos in the project
  interface RepoInfo { id: string; name: string }
  interface ReposResponse { value: RepoInfo[] }

  let repos: RepoInfo[];
  try {
    const reposUrl = `https://dev.azure.com/${orgName}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`;
    const result = await adoFetch<ReposResponse>(reposUrl, token);
    repos = result.value ?? [];
  } catch (err) {
    console.error(`[EditLess] Failed to list repos for ${orgName}/${project}:`, err);
    return [];
  }
  const allPRs: AdoPR[] = [];
  for (const repo of repos) {
    try {
      const prsUrl = `https://dev.azure.com/${orgName}/${encodeURIComponent(project)}/_apis/git/repositories/${repo.id}/pullrequests?searchCriteria.status=active&api-version=7.1`;

      interface PRDetail {
        pullRequestId: number;
        title: string;
        status: string;
        isDraft: boolean;
        sourceRefName: string;
        targetRefName: string;
        url: string;
        reviewers: Array<{ displayName: string; uniqueName: string; vote: number }>;
        repository: { name: string };
        createdBy: { displayName: string; uniqueName: string };
      }
      interface PRsResponse { value: PRDetail[] }

      const result = await adoFetch<PRsResponse>(prsUrl, token);
      for (const pr of result.value ?? []) {
        const webUrl = `https://dev.azure.com/${orgName}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repo.name)}/pullrequest/${pr.pullRequestId}`;
        const reviewerVotes = new Map<string, number>();
        for (const reviewer of pr.reviewers ?? []) {
          if (reviewer.uniqueName) {
            reviewerVotes.set((reviewer.uniqueName || '').toLowerCase(), reviewer.vote ?? 0);
          }
        }
        allPRs.push({
          id: pr.pullRequestId,
          title: pr.title,
          status: pr.status === 'active' ? 'open' : pr.status === 'completed' ? 'merged' : pr.status,
          isDraft: pr.isDraft ?? false,
          sourceRef: pr.sourceRefName?.replace('refs/heads/', '') ?? '',
          targetRef: pr.targetRefName?.replace('refs/heads/', '') ?? '',
          url: webUrl,
          repository: repo.name,
          reviewers: (pr.reviewers ?? []).map(r => r.displayName),
          createdBy: pr.createdBy?.uniqueName ?? '',
          reviewerVotes,
          project,
        });
      }
    } catch (err) {
      console.error(`[EditLess] Failed to fetch PRs from repo ${repo.name}:`, err);
    }
  }

  return allPRs;
}

const cachedAdoMe = new Map<string, AdoIdentity>();

export async function fetchAdoMe(
  org: string,
  token: string,
): Promise<AdoIdentity> {
  const orgName = normalizeOrg(org);
  const cacheKey = `${orgName}\n${token}`;
  const cached = cachedAdoMe.get(cacheKey);
  if (cached) return cached;

  const apiUrl = `https://dev.azure.com/${orgName}/_apis/connectionData`;

  interface ConnectionData {
    authenticatedUser: {
      providerDisplayName?: string;
      properties?: {
        Account?: { $value?: string };
      };
    };
  }

  try {
    const data = await adoFetch<ConnectionData>(apiUrl, token);
    const identity = {
      displayName: data.authenticatedUser?.providerDisplayName
        ?? data.authenticatedUser?.properties?.Account?.$value
        ?? '',
      uniqueName: data.authenticatedUser?.properties?.Account?.$value
        ?? data.authenticatedUser?.providerDisplayName
        ?? '',
    };
    cachedAdoMe.set(cacheKey, identity);
    return identity;
  } catch (err) {
    console.error('[EditLess] fetchAdoMe failed:', err);
    return { displayName: '', uniqueName: '' };
  }
}

/** Reset cached identity (for testing). */
export function _resetAdoMeCache(): void {
  cachedAdoMe.clear();
}

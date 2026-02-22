import * as https from 'https';
import * as url from 'url';

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

export async function fetchAdoWorkItems(
  org: string,
  project: string,
  token: string,
): Promise<AdoWorkItem[]> {
  const orgName = normalizeOrg(org);
  const wiqlUrl = `https://dev.azure.com/${orgName}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.1`;

  interface WiqlResponse { workItems: Array<{ id: number; url: string }> }
  const wiql = await adoFetch<WiqlResponse>(
    wiqlUrl + '&$top=50',
    token,
  ).catch(() => null);

  // WIQL requires POST, but for simplicity use a query endpoint
  // Fall back to a simple assigned-to-me query
  const queryUrl = `https://dev.azure.com/${orgName}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.1`;

  interface WiqlResult { workItems: Array<{ id: number }> }
  let ids: number[];
  try {
    // Use POST for WIQL
    ids = await new Promise<number[]>((resolve, reject) => {
      const parsed = new url.URL(queryUrl);
      const isPat = !token.startsWith('eyJ');
      const authHeader = isPat
        ? `Basic ${Buffer.from(':' + token).toString('base64')}`
        : `Bearer ${token}`;

      const body = JSON.stringify({
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @me AND [System.State] IN ('Active', 'New') ORDER BY [System.ChangedDate] DESC`,
      });

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
            reject(new Error(`WIQL returned ${res.statusCode}`));
            return;
          }
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk; });
          res.on('end', () => {
            try {
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
  } catch {
    return [];
  }

  if (ids.length === 0) return [];

  // Fetch work item details in batch (max 200)
  const batchIds = ids.slice(0, 50);
  const detailsUrl = `https://dev.azure.com/${orgName}/_apis/wit/workitems?ids=${batchIds.join(',')}&fields=System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo,System.AreaPath,System.Tags,System.Parent&api-version=7.1`;

  interface WorkItemDetail {
    id: number;
    fields: Record<string, unknown>;
    _links: { html: { href: string } };
  }
  interface BatchResponse { value: WorkItemDetail[] }

  try {
    const batch = await adoFetch<BatchResponse>(detailsUrl, token);
    return batch.value.map(wi => ({
      id: wi.id,
      title: (wi.fields['System.Title'] as string) ?? '',
      state: (wi.fields['System.State'] as string) ?? '',
      type: (wi.fields['System.WorkItemType'] as string) ?? '',
      url: wi._links?.html?.href ?? `https://dev.azure.com/${orgName}/${encodeURIComponent(project)}/_workitems/edit/${wi.id}`,
      assignedTo: ((wi.fields['System.AssignedTo'] as { displayName?: string })?.displayName) ?? '',
      areaPath: (wi.fields['System.AreaPath'] as string) ?? '',
      tags: ((wi.fields['System.Tags'] as string) ?? '').split(';').map(t => t.trim()).filter(Boolean),
      parentId: (wi.fields['System.Parent'] as number) ?? undefined,
    }));
  } catch {
    return [];
  }
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
  } catch {
    return [];
  }

  // Fetch PRs from each repo (created by me)
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
        reviewers: Array<{ displayName: string }>;
        repository: { name: string };
        createdBy: { displayName: string; uniqueName: string };
      }
      interface PRsResponse { value: PRDetail[] }

      const result = await adoFetch<PRsResponse>(prsUrl, token);
      for (const pr of result.value ?? []) {
        const webUrl = `https://dev.azure.com/${orgName}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repo.name)}/pullrequest/${pr.pullRequestId}`;
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
        });
      }
    } catch {
      // Skip repo on error
    }
  }

  return allPRs;
}

let cachedAdoMe: string | undefined;

export async function fetchAdoMe(
  org: string,
  token: string,
): Promise<string> {
  if (cachedAdoMe !== undefined) return cachedAdoMe;

  const orgName = normalizeOrg(org);
  const apiUrl = `https://dev.azure.com/${orgName}/_apis/connectionData`;

  interface ConnectionData {
    authenticatedUser: {
      providerDisplayName: string;
      properties: { Account: { $value: string } };
    };
  }

  try {
    const data = await adoFetch<ConnectionData>(apiUrl, token);
    cachedAdoMe = data.authenticatedUser?.properties?.Account?.$value ?? '';
  } catch {
    cachedAdoMe = '';
  }
  return cachedAdoMe;
}

/** Reset cached identity (for testing). */
export function _resetAdoMeCache(): void {
  cachedAdoMe = undefined;
}

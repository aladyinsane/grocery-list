/** Thin wrappers over the two sync endpoints. Both are safe to retry. */

import type {
  CreateHouseholdResponse,
  ListResponse,
  Mutation,
  MutationsResponse,
} from '@grocery/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function createHousehold(): Promise<CreateHouseholdResponse> {
  const response = await fetch('/api/households', { method: 'POST' });
  if (!response.ok) throw new ApiError('could not create the list', response.status);
  return (await response.json()) as CreateHouseholdResponse;
}

export async function fetchChanges(token: string, since: number): Promise<ListResponse> {
  const response = await fetch(`/api/list?since=${since}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ApiError('could not load the list', response.status);
  return (await response.json()) as ListResponse;
}

export async function pushMutations(
  token: string,
  mutations: readonly Mutation[],
): Promise<MutationsResponse> {
  const response = await fetch('/api/mutations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mutations }),
  });
  if (!response.ok) throw new ApiError('could not save changes', response.status);
  return (await response.json()) as MutationsResponse;
}

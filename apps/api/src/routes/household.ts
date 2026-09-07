/** `POST /api/households` -- mint a new household and its secret link (ADR-0004). */

import type { CreateHouseholdResponse } from '@grocery/shared';
import { generateToken, hashToken } from '../auth.js';
import { createHousehold, type Env } from '../db.js';
import { json } from '../http.js';

export async function handleCreateHousehold(request: Request, env: Env): Promise<Response> {
  const token = generateToken();
  const id = crypto.randomUUID();

  await createHousehold(env.DB, id, await hashToken(token), Date.now());

  // The only time the plaintext token leaves the server. From here on it lives in the
  // URL on two phones and as a hash in the database.
  const url = new URL(request.url);
  const body: CreateHouseholdResponse = {
    token,
    url: `${url.origin}/h/${token}`,
  };
  return json(body, 201);
}

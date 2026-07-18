import { AuthClient } from "./auth.js";
import { resolveClientConfig, type ResolvedClientConfig, type TxLineClientOptions } from "./core.js";
import { DataClient } from "./data.js";
import { HttpPipeline } from "./http.js";

export interface TxLineClient {
  readonly config: ResolvedClientConfig;
  readonly auth: AuthClient;
  readonly data: DataClient;
}

export function createTxLineClient(options: TxLineClientOptions): TxLineClient {
  const config = resolveClientConfig(options);
  const http = new HttpPipeline(config);
  const auth = new AuthClient(config, http);
  const data = new DataClient(http);
  return Object.freeze({ config, auth, data });
}

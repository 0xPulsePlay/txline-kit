import { AuthClient } from "./auth.js";
import { resolveClientConfig, type ResolvedClientConfig, type TxLineClientOptions } from "./core.js";
import { DataClient } from "./data.js";
import { HttpPipeline } from "./http.js";
import { KeeperClient } from "./keeper.js";
import { OnchainClient } from "./onchain.js";
import { ProofClient } from "./proofs.js";

export interface TxLineClient {
  readonly config: ResolvedClientConfig;
  readonly auth: AuthClient;
  readonly data: DataClient;
  readonly proofs: ProofClient;
  readonly onchain: OnchainClient;
  readonly keeper: KeeperClient;
}

export function createTxLineClient(options: TxLineClientOptions): TxLineClient {
  const config = resolveClientConfig(options);
  const http = new HttpPipeline(config);
  const auth = new AuthClient(config, http);
  const data = new DataClient(http);
  const proofs = new ProofClient(http, data);
  const onchain = new OnchainClient(config, http);
  const keeper = new KeeperClient(config.connection, data, proofs, onchain);
  return Object.freeze({ config, auth, data, proofs, onchain, keeper });
}

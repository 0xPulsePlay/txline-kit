import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { ConfigurationError } from "./errors.js";

export type TxLineNetwork = "mainnet" | "devnet";

export interface TxLineNetworkConfig {
  network: TxLineNetwork;
  apiOrigin: string;
  apiBase: string;
  rpcUrl: string;
  programId: PublicKey;
  tokenMint: PublicKey;
  explorerCluster: "mainnet-beta" | "devnet";
}

export const NETWORK_CONFIGS: Readonly<Record<TxLineNetwork, TxLineNetworkConfig>> = Object.freeze({
  mainnet: Object.freeze({
    network: "mainnet",
    apiOrigin: "https://txline.txodds.com",
    apiBase: "https://txline.txodds.com/api",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    tokenMint: new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"),
    explorerCluster: "mainnet-beta",
  }),
  devnet: Object.freeze({
    network: "devnet",
    apiOrigin: "https://txline-dev.txodds.com",
    apiBase: "https://txline-dev.txodds.com/api",
    rpcUrl: "https://api.devnet.solana.com",
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    tokenMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
    explorerCluster: "devnet",
  }),
});

export type SignableTransaction = Transaction | VersionedTransaction;

export interface WalletAdapterLike {
  publicKey: PublicKey;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: <T extends SignableTransaction>(transaction: T) => Promise<T>;
  signAllTransactions?: <T extends SignableTransaction>(transactions: T[]) => Promise<T[]>;
}

export type TxLineWallet = WalletAdapterLike | Keypair;

export interface TxLineCredentials {
  walletPublicKey?: string;
  txSig?: string;
  apiToken?: string;
  jwt?: string;
  activatedAt?: number;
}

export interface CredentialStore {
  get(): Promise<TxLineCredentials | undefined>;
  set(credentials: TxLineCredentials): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCredentialStore implements CredentialStore {
  private credentials: TxLineCredentials | undefined;

  constructor(initial?: TxLineCredentials) {
    this.credentials = initial ? { ...initial } : undefined;
  }

  async get(): Promise<TxLineCredentials | undefined> {
    return this.credentials ? { ...this.credentials } : undefined;
  }

  async set(credentials: TxLineCredentials): Promise<void> {
    this.credentials = { ...credentials };
  }

  async clear(): Promise<void> {
    this.credentials = undefined;
  }
}

export interface TxLineClientOptions {
  network: TxLineNetwork;
  wallet?: TxLineWallet;
  connection?: Connection;
  baseUrl?: string;
  credentialStore?: CredentialStore;
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
}

export interface ResolvedClientConfig extends TxLineNetworkConfig {
  authOrigin: string;
  apiBase: string;
  connection: Connection;
  wallet: TxLineWallet | undefined;
  credentialStore: CredentialStore;
  fetch: typeof globalThis.fetch;
  requestTimeoutMs: number;
  replay: boolean;
}

function cleanBaseUrl(value: string): string {
  const cleaned = value.trim().replace(/\/+$/, "");
  let parsed: URL;
  try { parsed = new URL(cleaned); } catch (cause) {
    throw new ConfigurationError(`Invalid TxLINE base URL: ${value}`, {
      code: "INVALID_BASE_URL",
      fix: "Use an absolute http:// or https:// URL for the replay server.",
      cause,
    });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ConfigurationError(`Unsupported TxLINE base URL protocol: ${parsed.protocol}`, {
      code: "INVALID_BASE_URL_PROTOCOL",
      fix: "Use http:// for a local replay server or https:// for a remote server.",
    });
  }
  return cleaned;
}

export function resolveClientConfig(options: TxLineClientOptions): ResolvedClientConfig {
  const network = NETWORK_CONFIGS[options.network];
  if (!network) {
    throw new ConfigurationError(`Unsupported TxLINE network: ${String(options.network)}`, {
      code: "INVALID_NETWORK",
      fix: "Choose exactly one of mainnet or devnet.",
    });
  }
  if (options.requestTimeoutMs !== undefined && (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0)) {
    throw new ConfigurationError("requestTimeoutMs must be a positive integer", {
      code: "INVALID_TIMEOUT",
      fix: "Pass a timeout in positive whole milliseconds.",
    });
  }
  const override = options.baseUrl ? cleanBaseUrl(options.baseUrl) : undefined;
  const apiBase = override ? (override.endsWith("/api") ? override : `${override}/api`) : network.apiBase;
  const authOrigin = override ? override.replace(/\/api$/, "") : network.apiOrigin;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new ConfigurationError("No Fetch API implementation is available", {
      code: "FETCH_UNAVAILABLE",
      fix: "Use Node.js 20+ or pass a standards-compatible fetch implementation.",
    });
  }
  return Object.freeze({
    ...network,
    apiBase,
    authOrigin,
    connection: options.connection ?? new Connection(network.rpcUrl, "confirmed"),
    wallet: options.wallet,
    credentialStore: options.credentialStore ?? new MemoryCredentialStore(),
    fetch: fetchImpl.bind(globalThis),
    requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
    replay: override !== undefined,
  });
}

export function walletPublicKey(wallet: TxLineWallet): PublicKey {
  return wallet instanceof Keypair ? wallet.publicKey : wallet.publicKey;
}

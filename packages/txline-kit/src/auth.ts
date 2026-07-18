import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import type { ResolvedClientConfig, TxLineCredentials, TxLineWallet } from "./core.js";
import { walletPublicKey } from "./core.js";
import { ActivationError, AuthenticationError, ConfigurationError } from "./errors.js";
import { HttpPipeline } from "./http.js";

export interface ActivateOptions {
  txSig: string;
  leagues?: readonly number[];
}

export interface SubscribeFreeOptions {
  serviceLevel: 1 | 12;
  durationWeeks?: number;
  leagues?: readonly number[];
}

export interface SubscriptionResult extends TxLineCredentials {
  txSig: string;
  apiToken: string;
  jwt: string;
  walletPublicKey: string;
}

function parseToken(body: string): string | undefined {
  try {
    const value = JSON.parse(body) as unknown;
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "token" in value && typeof value.token === "string") return value.token;
  } catch { /* provider may return a bare token */ }
  return body && !body.trim().startsWith("{") ? body.trim() : undefined;
}

async function signMessage(wallet: TxLineWallet, message: Uint8Array): Promise<Uint8Array> {
  if (wallet instanceof Keypair) return nacl.sign.detached(message, wallet.secretKey);
  if (!wallet.signMessage) {
    throw new AuthenticationError("The configured wallet cannot sign activation messages", {
      code: "SIGN_MESSAGE_UNAVAILABLE",
      fix: "Use a Keypair or a wallet adapter that implements signMessage(Uint8Array).",
    });
  }
  return wallet.signMessage(message);
}

function base64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export class AuthClient {
  private guestPromise: Promise<string> | undefined;

  constructor(private readonly config: ResolvedClientConfig, private readonly http: HttpPipeline) {
    this.http.setJwtRenewer(() => this.startGuest());
  }

  async credentials(): Promise<TxLineCredentials | undefined> {
    return this.config.credentialStore.get();
  }

  async clear(): Promise<void> {
    await this.config.credentialStore.clear();
  }

  async startGuest(): Promise<string> {
    if (this.guestPromise) return this.guestPromise;
    this.guestPromise = this.startGuestOnce();
    try { return await this.guestPromise; } finally { this.guestPromise = undefined; }
  }

  private async startGuestOnce(): Promise<string> {
    const response = await this.http.request(this.http.authUrl("/auth/guest/start"), { method: "POST" }, { auth: false, retry401: false });
    if (!response.ok) {
      const body = await response.text();
      throw new AuthenticationError(`Guest authentication failed with HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`, {
        code: "GUEST_AUTH_FAILED",
        status: response.status,
        fix: "Check the selected network host and provider availability.",
      });
    }
    const body = await response.text();
    let token: string | undefined;
    try {
      const parsed = JSON.parse(body) as { token?: unknown };
      token = typeof parsed.token === "string" ? parsed.token : undefined;
    } catch { /* handled below */ }
    if (!token) {
      throw new AuthenticationError("Guest authentication response did not contain a token", {
        code: "GUEST_TOKEN_MISSING",
        fix: "Confirm the API host matches the selected network and inspect provider status.",
      });
    }
    const current = await this.config.credentialStore.get();
    await this.config.credentialStore.set({ ...current, jwt: token });
    return token;
  }

  async activate(options: ActivateOptions): Promise<SubscriptionResult> {
    const wallet = this.requireWallet();
    if (!options.txSig.trim()) {
      throw new ActivationError("Activation requires a confirmed subscription transaction signature", {
        code: "ACTIVATION_SIGNATURE_MISSING",
        fix: "Pass the signature returned by the matching network's subscribe transaction.",
      });
    }
    const leagues = [...(options.leagues ?? [])];
    if (leagues.some((league) => !Number.isSafeInteger(league) || league < 0)) {
      throw new ActivationError("Activation leagues must be non-negative integer IDs", {
        code: "ACTIVATION_LEAGUES_INVALID",
        fix: "Use provider league IDs in their intended order, or [] for the free World Cup bundle.",
      });
    }
    const current = await this.config.credentialStore.get();
    const publicKey = walletPublicKey(wallet).toBase58();
    if (current?.walletPublicKey && current.walletPublicKey !== publicKey) {
      throw new ActivationError("Stored credentials belong to a different wallet", {
        code: "ACTIVATION_WALLET_MISMATCH",
        fix: "Clear the credential store or reconnect the wallet that submitted the subscription transaction.",
      });
    }
    const jwt = current?.jwt ?? await this.startGuest();
    const preimage = `${options.txSig}:${leagues.join(",")}:${jwt}`;
    const signature = await signMessage(wallet, new TextEncoder().encode(preimage));
    const response = await this.http.request("/token/activate", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ txSig: options.txSig, walletSignature: base64(signature), leagues }),
    }, { auth: false, retry401: false });
    const body = await response.text();
    if (!response.ok) {
      throw new ActivationError(`TxLINE activation failed with HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`, {
        code: "ACTIVATION_FAILED",
        status: response.status,
        fix: response.status === 403
          ? "Check that transaction, wallet signature, JWT, league order, API host, and program ID all come from the same network."
          : "Confirm the subscription transaction and retry activation on the matching host.",
      });
    }
    const apiToken = parseToken(body);
    if (!apiToken) {
      throw new ActivationError("Activation response did not contain an API token", {
        code: "ACTIVATION_TOKEN_MISSING",
        fix: "Inspect provider status and preserve the transaction signature before retrying.",
      });
    }
    const credentials: SubscriptionResult = {
      walletPublicKey: publicKey,
      txSig: options.txSig,
      apiToken,
      jwt,
      activatedAt: Date.now(),
    };
    await this.config.credentialStore.set(credentials);
    return credentials;
  }

  async subscribeFree(options: SubscribeFreeOptions): Promise<SubscriptionResult> {
    const wallet = this.requireWallet();
    const durationWeeks = options.durationWeeks ?? 4;
    if (!Number.isSafeInteger(durationWeeks) || durationWeeks <= 0 || durationWeeks % 4 !== 0) {
      throw new ConfigurationError("TxLINE subscription duration must be a positive multiple of four weeks", {
        code: "SUBSCRIPTION_DURATION_INVALID",
        fix: "Use durationWeeks: 4 for the hackathon free tier.",
      });
    }
    const current = await this.config.credentialStore.get();
    const publicKey = walletPublicKey(wallet);
    if (current?.walletPublicKey && current.walletPublicKey !== publicKey.toBase58()) {
      throw new AuthenticationError("Stored credentials belong to a different subscription wallet", {
        code: "SUBSCRIPTION_WALLET_MISMATCH",
        fix: "Clear credentials before changing wallets.",
      });
    }
    if (current?.txSig) return this.activate(options.leagues === undefined
      ? { txSig: current.txSig }
      : { txSig: current.txSig, leagues: options.leagues });

    // Keep Anchor and token-program code out of read-only browser bundles until a
    // caller explicitly asks to submit a subscription transaction.
    const { submitFreeSubscription } = await import("./subscription.js");
    const txSig = await submitFreeSubscription(this.config, this.http, wallet, options.serviceLevel, durationWeeks);
    const jwt = current?.jwt ?? await this.startGuest();
    await this.config.credentialStore.set({ walletPublicKey: publicKey.toBase58(), txSig, jwt });
    return this.activate(options.leagues === undefined ? { txSig } : { txSig, leagues: options.leagues });
  }

  private requireWallet(): TxLineWallet {
    if (!this.config.wallet) {
      throw new AuthenticationError("This operation requires a wallet", {
        code: "WALLET_MISSING",
        fix: "Pass a Keypair or compatible wallet adapter to createTxLineClient.",
      });
    }
    return this.config.wallet;
  }

}

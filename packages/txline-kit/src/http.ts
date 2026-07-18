import type { ResolvedClientConfig, TxLineCredentials } from "./core.js";
import { AuthenticationError, HttpError } from "./errors.js";

export interface RequestOptions {
  auth?: boolean;
  retry401?: boolean;
}

export type JwtRenewer = () => Promise<string>;

function responseExcerpt(body: string): string {
  const cleaned = body.replace(/[\r\n\t]+/g, " ").trim();
  return cleaned.length > 300 ? `${cleaned.slice(0, 300)}…` : cleaned;
}

export class HttpPipeline {
  private renewJwt: JwtRenewer | undefined;

  constructor(readonly config: ResolvedClientConfig) {}

  setJwtRenewer(renewer: JwtRenewer): void {
    this.renewJwt = renewer;
  }

  apiUrl(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    return `${this.config.apiBase}/${path.replace(/^\/+/, "")}`;
  }

  authUrl(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    return `${this.config.authOrigin}/${path.replace(/^\/+/, "")}`;
  }

  async request(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<Response> {
    return this.attempt(path, init, options, false);
  }

  private async attempt(path: string, init: RequestInit, options: RequestOptions, alreadyRetried: boolean): Promise<Response> {
    const auth = options.auth ?? true;
    const headers = new Headers(init.headers);
    if (auth) {
      const credentials = await this.config.credentialStore.get();
      this.applyCredentials(headers, credentials);
    }
    const timeout = AbortSignal.timeout(this.config.requestTimeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.config.fetch(this.apiUrl(path), { ...init, headers, signal });
    } catch (cause) {
      if (init.signal?.aborted) throw init.signal.reason;
      throw new HttpError(`TxLINE request failed: ${this.apiUrl(path)}`, {
        code: "HTTP_TRANSPORT_FAILED",
        fix: "Check network connectivity, the configured host, and the request timeout.",
        cause,
      });
    }
    if (response.status === 401 && auth && !alreadyRetried && (options.retry401 ?? true)) {
      await response.body?.cancel();
      if (!this.renewJwt) {
        throw new AuthenticationError("TxLINE rejected the JWT and no renewal handler is installed", {
          code: "JWT_RENEWAL_UNAVAILABLE",
          status: 401,
          fix: "Create requests through createTxLineClient so authentication renewal is configured.",
        });
      }
      await this.renewJwt();
      return this.attempt(path, init, options, true);
    }
    return response;
  }

  async expectOk(response: Response, operation: string): Promise<Response> {
    if (response.ok) return response;
    const body = await response.text();
    throw new HttpError(`${operation} failed with HTTP ${response.status}${body ? `: ${responseExcerpt(body)}` : ""}`, {
      code: "HTTP_RESPONSE_ERROR",
      status: response.status,
      fix: response.status === 401 || response.status === 403
        ? "Renew or activate credentials on the same network as the API host."
        : "Check the endpoint arguments and provider status, then retry if appropriate.",
    });
  }

  private applyCredentials(headers: Headers, credentials: TxLineCredentials | undefined): void {
    if (!credentials?.jwt || !credentials.apiToken) {
      if (this.config.replay) return;
      throw new AuthenticationError("TxLINE API credentials are not activated", {
        code: "CREDENTIALS_MISSING",
        fix: "Call tx.auth.subscribeFree() or tx.auth.startGuest() followed by tx.auth.activate().",
      });
    }
    headers.set("Authorization", `Bearer ${credentials.jwt}`);
    headers.set("X-Api-Token", credentials.apiToken);
  }
}

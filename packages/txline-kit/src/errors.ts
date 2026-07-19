export interface TxLineErrorOptions {
  code: string;
  fix: string;
  status?: number;
  cause?: unknown;
}

export class TxLineError extends Error {
  readonly code: string;
  readonly fix: string;
  readonly status: number | undefined;

  constructor(message: string, options: TxLineErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.fix = options.fix;
    this.status = options.status;
  }
}

export class ConfigurationError extends TxLineError {}
export class AuthenticationError extends TxLineError {}
export class ActivationError extends AuthenticationError {}
export class HttpError extends TxLineError {}
export class DataShapeError extends TxLineError {}
export class StreamError extends TxLineError {}
export class ProofError extends TxLineError {}
export class VerificationError extends TxLineError {}
export class StrategyError extends TxLineError {}
export class CoverageError extends StrategyError {}
export class KeeperError extends TxLineError {}
export class JournalError extends TxLineError {}

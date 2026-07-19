import { Eyebrow } from "./Eyebrow";
import { productionCommit, productionDiffFiles, type DiffFile } from "./production-data";

function DiffLine({ line, index }: { line: string; index: number }) {
  const marker = line.slice(0, 1);
  const tone = marker === "+" ? "add" : marker === "-" ? "del" : "ctx";
  const body = marker === "+" || marker === "-" ? line.slice(1) : line;
  return (
    <div className={`diff-line diff-line--${tone}`}>
      <span className="diff-line__marker" aria-hidden="true">{marker === "+" ? "+" : marker === "-" ? "−" : " "}</span>
      <span className="diff-line__body">{body || " "}</span>
    </div>
  );
}

function DiffCard({ file }: { file: DiffFile }) {
  const lines = file.diff.split("\n");
  const netLabel = file.status === "deleted"
    ? `${file.before} lines deleted — file removed`
    : `${file.before} → ${file.after} lines (−${file.removed} / +${file.added})`;
  return (
    <article className="diff-card">
      <header className="diff-card__head">
        <div>
          <span className={`diff-card__status diff-card__status--${file.status}`}>{file.status === "deleted" ? "Deleted" : "Rewritten"}</span>
          <code className="diff-card__path">{file.path}</code>
        </div>
        <span className="diff-card__loc">{netLabel}</span>
      </header>
      <pre className="diff-block" aria-label={`Diff excerpt for ${file.path}`}>
        <code>
          {lines.map((line, index) => <DiffLine key={index} line={line} index={index} />)}
        </code>
      </pre>
      <p className="diff-card__note">Excerpt from the real commit — truncated for display, not rewritten. Full file history is in the linked commit.</p>
    </article>
  );
}

export function Production() {
  const totalRemoved = productionDiffFiles.reduce((sum, file) => sum + file.removed, 0);
  const totalAdded = productionDiffFiles.reduce((sum, file) => sum + file.added, 0);
  return (
    <div className="screen production" data-testid="production-screen">
      <div className="screen-title">
        <div>
          <Eyebrow>Used in production</Eyebrow>
          <h1>Another team deleted their ABI.</h1>
        </div>
        <p>
          Proofline&rsquo;s Solana mainnet settlement adapter is built on txline-kit-cpi. Adopting the crate let
          them delete the hand-rolled TxOracle instruction-encoding they had shipped before it existed.
        </p>
      </div>

      <section className="production-summary">
        <p>
          <strong>{productionCommit.project}</strong> runs a real Solana mainnet program that CPIs into TxLINE to verify
          settlement outcomes. Before adopting txline-kit-cpi, its adapter hand-transcribed TxOracle&rsquo;s Anchor IDL
          into its own Rust types and hand-built the raw <code>validate_stat_v2</code> instruction — the exact kind
          of ABI code this crate exists to remove. Commit{" "}
          <a href={productionCommit.url} target="_blank" rel="noreferrer"><code>{productionCommit.sha}</code></a>{" "}
          (&ldquo;{productionCommit.title}&rdquo;) deleted it: <code>src/txline/idl_types.rs</code> is gone entirely,
          and <code>src/txline/instruction.rs</code> now says outright &ldquo;this module deliberately contains no
          ABI.&rdquo; The dependency is declared as a Cargo path dependency on txline-kit-cpi, not a published
          crates.io release — the adapter now calls <code>txline_cpi::validate_stat_v2_instruction</code> and{" "}
          <code>txline_cpi::daily_scores_pda</code> directly instead of re-deriving the wire format itself.
        </p>
        <div className="production-tally">
          <div><b>{totalRemoved}</b><span>lines of hand-rolled ABI removed</span></div>
          <div><b>{totalAdded}</b><span>lines added across both files</span></div>
          <div><b>1</b><span>file deleted outright</span></div>
        </div>
      </section>

      <section className="production-diffs" aria-label="Real before/after diff excerpts">
        {productionDiffFiles.map((file) => <DiffCard key={file.path} file={file} />)}
      </section>

      <section className="production-link">
        <a className="button button--primary" target="_blank" rel="noreferrer" href={productionCommit.url}>
          View the real commit on GitHub <span>↗</span>
        </a>
        <span className="production-link__repo">{productionCommit.repo} @ {productionCommit.sha}</span>
      </section>
    </div>
  );
}

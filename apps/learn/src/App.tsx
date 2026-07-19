import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { copy, modules, replayFixtures, settlementSteps, type ReplayEvent } from "./data";
import { Eyebrow, SparkMark } from "./Eyebrow";
import { Production } from "./Production";

type Screen = "overview" | "replay" | "strategy" | "proof" | "settlement" | "modules" | "production";
const screens: Array<{ id: Screen; label: string; index: string }> = [
  { id: "overview", label: "Start here", index: "00" },
  { id: "replay", label: "Replay lab", index: "01" },
  { id: "strategy", label: "Strategy studio", index: "02" },
  { id: "proof", label: "Proof anatomy", index: "03" },
  { id: "settlement", label: "Settlement", index: "04" },
  { id: "modules", label: "SDK map", index: "05" },
  { id: "production", label: "Used in production", index: "06" },
];

function useHashScreen(): [Screen, (screen: Screen) => void] {
  const fromHash = (): Screen => {
    const value = location.hash.slice(1) as Screen;
    return screens.some(({ id }) => id === value) ? value : "overview";
  };
  const [screen, setScreen] = useState<Screen>(fromHash);
  useEffect(() => {
    const update = () => setScreen(fromHash());
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return [screen, (next) => { location.hash = next; setScreen(next); }];
}

function Overview({ navigate }: { navigate: (screen: Screen) => void }) {
  return <div className="screen overview" data-testid="overview-screen">
    <section className="hero-grid">
      <div className="hero-copy">
        <Eyebrow>Proof-native integration kit</Eyebrow>
        <h1>See the match.<br /><em>Inspect the truth.</em></h1>
        <p className="lede">TxLINE Kit turns live sports data into deterministic replay, typed predicates, inspectable Merkle receipts, and proof-settled Solana transactions.</p>
        <div className="hero-actions">
          <button className="button button--primary" onClick={() => navigate("replay")}>Open replay lab <span>↗</span></button>
          <button className="button button--quiet" onClick={() => navigate("settlement")}>Inspect mainnet receipt</button>
        </div>
      </div>
      <div className="signal-card" aria-label="Proof signal summary">
        <div className="signal-card__orbit" aria-hidden="true"><i /><i /><i /></div>
        <div className="signal-card__center"><span>01</span><strong>TRUE</strong><small>TxLINE return</small></div>
        <div className="signal-card__stat stat-a"><b>216,993</b><span>compute units</span></div>
        <div className="signal-card__stat stat-b"><b>3</b><span>replay fixtures</span></div>
        <div className="signal-card__stat stat-c"><b>9</b><span>safe modules</span></div>
      </div>
    </section>
    <section className="journey" aria-labelledby="journey-title">
      <div className="section-heading"><Eyebrow>One bundle, three trust levels</Eyebrow><h2 id="journey-title">Follow evidence from feed to finality.</h2></div>
      <div className="journey-line">
        {[
          ["01", "Capture", "Preserve the original clock"],
          ["02", "Replay", "Seek, pause, and reproduce"],
          ["03", "Prove", "Bind ordered stats to a root"],
          ["04", "Settle", "Consume exact CPI return data"],
        ].map(([n, title, body], index) => <button key={title} className="journey-node" onClick={() => navigate((["replay", "replay", "proof", "settlement"] as Screen[])[index]!)}>
          <span>{n}</span><strong>{title}</strong><small>{body}</small>
        </button>)}
      </div>
    </section>
    <section className="fixture-strip" aria-label={copy.fixtureAriaLabel}>
      <div><Eyebrow>{copy.fixtureEyebrow}</Eyebrow><h2>{copy.fixtureHeadingLine1}<br />{copy.fixtureHeadingLine2}</h2></div>
      {replayFixtures.map((fixture) => <article key={fixture.title} className={`mini-fixture tone-${fixture.accent}`}>
        <span>Fixture {fixture.fixtureId}</span><strong>{fixture.title}</strong>
        <b className={fixture.result ? "" : "pre-match"}>{fixture.result ? `${fixture.result[0]} — ${fixture.result[1]}` : "Pre-match · kickoff 19:00 UTC"}</b>
        <small>{fixture.events.length} {fixture.source ? "real captured records" : "deterministic records"}</small>
        {fixture.source ? <small>{fixture.source}</small> : null}
      </article>)}
    </section>
  </div>;
}

function eventIcon(event: ReplayEvent) {
  if (event.action.includes("goal")) return "●";
  if (event.action.includes("final")) return "◆";
  if (event.channel === "proof") return "◇";
  if (event.channel === "odds") return "⌁";
  return "·";
}

function ReplayLab() {
  const [fixtureIndex, setFixtureIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const fixture = replayFixtures[fixtureIndex]!;
  useEffect(() => { setCursor(0); setPlaying(false); }, [fixtureIndex]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setCursor((value) => value >= fixture.events.length - 1 ? (setPlaying(false), value) : value + 1), 850);
    return () => clearInterval(timer);
  }, [playing, fixture.events.length]);
  const visible = fixture.events.slice(0, cursor + 1);
  const current = fixture.events[cursor]!;
  const score = [...visible].reverse().find((event) => event.score)?.score;
  const counts = useMemo(() => Object.fromEntries(["sse", "snapshot", "proof", "odds"].map((channel) => [channel, visible.filter((event) => event.channel === channel).length])), [visible]);
  return <div className="screen replay-screen" data-testid="replay-screen">
    <div className="screen-title"><div><Eyebrow>Deterministic virtual clock</Eyebrow><h1>Replay lab</h1></div><p>Scrub every captured envelope. The API shape stays constant while time becomes a tool.</p></div>
    <div className="replay-layout">
      <aside className="fixture-rail" aria-label="Choose replay fixture">
        {replayFixtures.map((item, index) => <button className={index === fixtureIndex ? "active" : ""} key={item.title} onClick={() => setFixtureIndex(index)}>
          <span>0{index + 1}</span><strong>{item.title}</strong><small>Fixture {item.fixtureId}</small>
        </button>)}
      </aside>
      <section className="replay-stage">
        <div className="scoreboard">
          <div><small>Home</small><strong>{fixture.home}</strong></div>
          {score
            ? <b>{score[0]}<i>:</i>{score[1]}</b>
            : fixture.source
              ? <b className="pre-match">Pre-match · kickoff 19:00 UTC</b>
              : <b>0<i>:</i>0</b>}
          <div className="align-right"><small>Away</small><strong>{fixture.away}</strong></div>
        </div>
        <div className="timeline" aria-label={`Replay position ${cursor + 1} of ${fixture.events.length}`}>
          <div className="timeline__track"><i style={{ width: `${cursor / (fixture.events.length - 1) * 100}%` }} /></div>
          {fixture.events.map((event, index) => <button key={event.recordId} aria-label={`Jump to ${event.summary}`} className={`${index <= cursor ? "seen" : ""} ${index === cursor ? "current" : ""}`} style={{ left: `${index / (fixture.events.length - 1) * 100}%` }} onClick={() => setCursor(index)}>{eventIcon(event)}</button>)}
        </div>
        <div className="transport">
          <button aria-label="Previous record" onClick={() => setCursor(Math.max(0, cursor - 1))}>←</button>
          <button className="play" onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
          <button aria-label="Next record" onClick={() => setCursor(Math.min(fixture.events.length - 1, cursor + 1))}>→</button>
          <span>Record {current.recordId} / {fixture.events.length}</span><code>+{current.at - fixture.events[0]!.at}ms</code>
        </div>
        <div className="channel-meter">
          {Object.entries(counts).map(([channel, count]) => <div key={channel}><span>{channel}</span><i style={{ "--meter": `${Math.max(8, Number(count) / fixture.events.length * 100)}%` } as React.CSSProperties} /><b>{count}</b></div>)}
        </div>
      </section>
      <aside className="record-inspector" aria-live="polite">
        <Eyebrow>Current envelope</Eyebrow><div className={`channel-tag channel-${current.channel}`}>{current.channel}</div><h2>{current.summary}</h2>
        <dl><div><dt>Action</dt><dd>{current.action}</dd></div><div><dt>Sequence</dt><dd>{current.sequence ?? "—"}</dd></div><div><dt>Captured</dt><dd>+{current.at - fixture.events[0]!.at}ms</dd></div></dl>
        <div className="hash"><span>SHA-256 body receipt</span><code>{current.checksum}</code></div>
      </aside>
    </div>
  </div>;
}

type Outcome = "home" | "draw" | "away";
function StrategyStudio() {
  const [outcome, setOutcome] = useState<Outcome>("home");
  const [home, setHome] = useState(2);
  const [away, setAway] = useState(1);
  const difference = home - away;
  const passes = outcome === "home" ? difference > 0 : outcome === "draw" ? difference === 0 : difference < 0;
  const comparison = outcome === "home" ? "> 0" : outcome === "draw" ? "= 0" : "< 0";
  return <div className="screen" data-testid="strategy-screen">
    <div className="screen-title"><div><Eyebrow>Total coverage by construction</Eyebrow><h1>Strategy studio</h1></div><p>Name the market semantics. The compiler owns positional indices and refuses uncovered stats.</p></div>
    <div className="strategy-grid">
      <section className="control-panel"><h2>Final result</h2><div className="segmented" role="group" aria-label="Choose market outcome">{(["home", "draw", "away"] as Outcome[]).map((item) => <button className={outcome === item ? "active" : ""} onClick={() => setOutcome(item)} key={item}>{item}</button>)}</div>
        <label>Home goals <output>{home}</output><input aria-label="Home goals" type="range" min="0" max="5" value={home} onChange={(event) => setHome(Number(event.target.value))} /></label>
        <label>Away goals <output>{away}</output><input aria-label="Away goals" type="range" min="0" max="5" value={away} onChange={(event) => setAway(Number(event.target.value))} /></label>
        <div className={`verdict ${passes ? "pass" : "fail"}`}><span>{passes ? "Predicate true" : "Predicate false"}</span><strong>{home} − {away} {comparison}</strong></div>
      </section>
      <section className="predicate-canvas" aria-label="Compiled predicate graph">
        <div className="stat-node home"><span>index 0</span><strong>homeGoals</strong><b>key 1</b></div>
        <div className="stat-node away"><span>index 1</span><strong>awayGoals</strong><b>key 2</b></div>
        <svg viewBox="0 0 600 250" role="img"><title>Home and away goal stats flow into subtraction and comparison</title><path d="M130 65 C230 65 210 125 300 125"/><path d="M470 65 C370 65 390 125 300 125"/><path d="M300 145 L300 205"/></svg>
        <div className="operator-node"><span>binary</span><strong>subtract</strong></div><div className={`compare-node ${passes ? "pass" : "fail"}`}><span>threshold</span><strong>{comparison}</strong></div>
      </section>
      <section className="compiler-output"><Eyebrow>Compiler receipt</Eyebrow><div className="code-lines"><span><i>01</i> strategy()</span><span><i>02</i> .stat(<b>"homeGoals"</b>, 1)</span><span><i>03</i> .stat(<b>"awayGoals"</b>, 2)</span><span><i>04</i> .binary(<b>subtract</b>, <b>{comparison}</b>)</span><span><i>05</i> .compile() <em>✓ total coverage</em></span></div></section>
    </div>
  </div>;
}

const proofNodes = [
  { id: "stats", label: "Ordered stats", value: "[homeGoals, awayGoals]", detail: "Positions are owned by the requested stat-key order." },
  { id: "event", label: "Event-stat root", value: "32 bytes", detail: "Each stat path rolls into one fixture-level event root." },
  { id: "fixture", label: "Fixture summary", value: "fixture + time", detail: "The summary binds fixture identity and update timestamps." },
  { id: "daily", label: "Daily root PDA", value: "u16 LE epoch day", detail: "The proof timestamp derives the exact on-chain root account." },
];
function ProofAnatomy() {
  const [selected, setSelected] = useState("event");
  const node = proofNodes.find((item) => item.id === selected)!;
  return <div className="screen" data-testid="proof-screen">
    <div className="screen-title"><div><Eyebrow>One bundle, inspect every boundary</Eyebrow><h1>Proof anatomy</h1></div><p>Trace ordered values upward until a permanently anchored Solana account agrees.</p></div>
    <div className="proof-grid">
      <section className="merkle-map" aria-label="Interactive proof layers">
        {proofNodes.map((item, index) => <button key={item.id} className={`${selected === item.id ? "active" : ""} layer-${index}`} onClick={() => setSelected(item.id)}><span>0{index + 1}</span><strong>{item.label}</strong><small>{item.value}</small></button>)}
        <svg viewBox="0 0 760 480" aria-hidden="true"><path d="M160 95 C310 95 250 175 380 175"/><path d="M600 95 C450 95 510 175 380 175"/><path d="M380 215 L380 285"/><path d="M380 335 L380 405"/></svg>
        <div className="proof-pulse" aria-hidden="true" />
      </section>
      <aside className="proof-detail" aria-live="polite"><Eyebrow>Selected layer</Eyebrow><span className="big-index">{String(proofNodes.indexOf(node) + 1).padStart(2, "0")}</span><h2>{node.label}</h2><p>{node.detail}</p><div className="byte-ruler">{Array.from({ length: 16 }, (_, index) => <i key={index} className={index < 11 ? "filled" : ""} />)}</div><code>0x8f 2a c1 7e … 32 bytes exact</code></aside>
    </div>
    <section className="trust-ladder"><div><span>Fast</span><strong>verifyLocal</strong><small>Recompute paths; compare root</small></div><i>→</i><div><span>Simulated</span><strong>verifyView</strong><small>Ask TxLINE without a fee</small></div><i>→</i><div><span>Composed</span><strong>buildValidateIx</strong><small>Settle inside your transaction</small></div></section>
  </div>;
}

function SettlementReceipt() {
  const [selected, setSelected] = useState(3);
  const step = settlementSteps[selected]!;
  return <div className="screen" data-testid="settlement-screen">
    <div className="screen-title"><div><Eyebrow>Finalized on Solana mainnet</Eyebrow><h1>Settlement receipt</h1></div><p>A complete valueless escrow chain, from market initialization through rent-safe teardown.</p></div>
    <section className="receipt-hero"><div><span className="live-pill"><i /> Program live</span><h2>Fixture 18,241,006</h2><p>Recorded final score</p><strong>HOME 1 <i>—</i> 2 AWAY</strong></div><div className="compute-ring" style={{ "--value": "72%" } as React.CSSProperties}><span>216,993</span><small>compute units</small></div><dl><div><dt>TxLINE return</dt><dd>01 · true</dd></div><div><dt>Finalized slot</dt><dd>433,642,899</dd></div><div><dt>ProgramData rent</dt><dd>2.78609496 SOL</dd></div></dl></section>
    <section className="transaction-river">
      <div className="river-line" aria-hidden="true" />
      {settlementSteps.map((item, index) => <button key={item.signature} className={selected === index ? "active" : ""} onClick={() => setSelected(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.label}</strong><small>{item.detail}</small></button>)}
    </section>
    <section className="tx-detail" aria-live="polite"><div><Eyebrow>Selected transaction</Eyebrow><h2>{step.label}</h2><p>{step.detail}</p></div><code>{step.signature}</code><a className="button button--primary" target="_blank" rel="noreferrer" href={`https://solscan.io/tx/${step.signature}`}>Open in Solscan ↗</a></section>
    <section className="safety-grid"><article><span>01</span><h3>Proof-bound result</h3><p>Callers cannot inject an arbitrary strategy into settlement.</p></article><article><span>02</span><h3>Disjoint exits</h3><p>Settlement closes before permissionless refunds begin.</p></article><article><span>03</span><h3>Rent-safe teardown</h3><p>Every position and token must be terminal before closure.</p></article><article><span>04</span><h3>Authority retained</h3><p>Upgradeable today; ProgramData rent remains recoverable.</p></article></section>
  </div>;
}

function ModuleMap() {
  const [selected, setSelected] = useState("strategy");
  const active = modules.find((module) => module.name === selected)!;
  return <div className="screen" data-testid="modules-screen">
    <div className="screen-title"><div><Eyebrow>One package, intentional boundaries</Eyebrow><h1>SDK map</h1></div><p>Import only the layer you need. Every sharp edge has one typed owner.</p></div>
    <div className="module-map">
      <div className="module-core"><span>@0xpulseplay</span><strong>txline-kit</strong><small>ESM + CJS + types</small></div>
      {modules.map((module, index) => <button key={module.name} onClick={() => setSelected(module.name)} className={`${selected === module.name ? "active" : ""} tone-${module.tone}`} style={{ "--angle": `${index * 40}deg` } as React.CSSProperties}><SparkMark tone={module.tone}/><strong>{module.name}</strong></button>)}
    </div>
    <section className="module-detail" aria-live="polite"><div><Eyebrow>Selected export</Eyebrow><h2>/{active.name}</h2><p>{active.role}</p></div><div className="install-line"><span>import</span> &#123; … &#125; <span>from</span> "@0xpulseplay/txline-kit/{active.name}"</div><div className="guarantee"><span>Design guarantee</span><strong>{active.name === "strategy" ? "Positional indices are never hand-authored." : active.name === "proofs" ? "Every hash decodes to exactly 32 bytes." : active.name === "replay" ? "One recording produces one deterministic clock." : "Network identity flows from one client configuration."}</strong></div></section>
  </div>;
}

export function App() {
  const [screen, navigate] = useHashScreen();
  useEffect(() => {
    if (matchMedia("(max-width: 720px)").matches) {
      document.querySelector<HTMLElement>(".side-nav .active")?.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }, [screen]);
  return <div className="app-shell">
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="topbar"><button className="brand" onClick={() => navigate("overview")} aria-label="TxLINE Kit home"><SparkMark /><strong>TxLINE</strong><span>kit</span></button><div className="network"><i /> {copy.networkBadge}</div><div className="topbar-links"><Link to="/story">The story ↗</Link><Link to="/feedback">API feedback ↗</Link><a href="https://github.com/0xPulsePlay/txline-kit" target="_blank" rel="noreferrer">GitHub ↗</a></div></header>
    <div className="body-grid">
      <nav className="side-nav" aria-label="Learning screens">{screens.map((item) => <button key={item.id} aria-current={screen === item.id ? "page" : undefined} className={screen === item.id ? "active" : ""} onClick={() => navigate(item.id)}><span>{item.index}</span><strong>{item.label}</strong></button>)}</nav>
      <main id="content">{screen === "overview" ? <Overview navigate={navigate} /> : screen === "replay" ? <ReplayLab /> : screen === "strategy" ? <StrategyStudio /> : screen === "proof" ? <ProofAnatomy /> : screen === "settlement" ? <SettlementReceipt /> : screen === "modules" ? <ModuleMap /> : <Production />}</main>
    </div>
    <footer><span>MIT OR Apache-2.0</span><span>Hackathon demo · not audited · no valuable custody</span><span>Built for evidence, not screenshots</span></footer>
  </div>;
}

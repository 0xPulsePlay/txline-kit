import { useState } from "react";
import { Link } from "react-router-dom";
import { Eyebrow, SparkMark } from "./Eyebrow";
import { modules, settlementSteps } from "./data";
import { Production } from "./Production";
import {
  captureMeta,
  matchStats,
  oddsMeta,
  oddsSeries,
  possessionTicks,
  releaseNote,
  timeline,
  type TimelineEvent,
} from "./story-data";
import "./story.css";

const MATCH_DURATION_SECONDS = 5400; // 90 real minutes, the timeline axis span

function timelineDot(event: TimelineEvent) {
  if (event.action === "shot") return "●";
  if (event.action === "corner") return "◢";
  if (event.action === "yellow_card") return "▮";
  if (event.action === "substitution") return "⇄";
  if (event.action === "halftime_finalised") return "◆";
  return "◇";
}

function timelineLabel(event: TimelineEvent) {
  const team = event.participant === 1 ? captureMeta.home : event.participant === 2 ? captureMeta.away : "";
  switch (event.action) {
    case "kickoff_team": return "Coin toss";
    case "kickoff": return event.statusId === 4 ? "Second-half kickoff" : "Kickoff";
    case "halftime_finalised": return "Half-time confirmed";
    case "shot": return `Shot — ${team}`;
    case "corner": return `Corner — ${team}`;
    case "yellow_card": return `Yellow card — ${team}`;
    case "substitution": return `Substitution — ${team}`;
    default: return event.action;
  }
}

function StoryTimeline() {
  const plotted = timeline.filter((event) => event.clockSeconds !== null);
  return (
    <div className="story-timeline" role="img" aria-label="Real match-event timeline, kickoff to 83:26">
      <div className="story-timeline__axis">
        <span>0′</span><span>45′ HT</span><span>90′</span>
      </div>
      <div className="story-timeline__track">
        <i className="story-timeline__progress" style={{ width: `${(captureMeta.clockMMSS === "83:26" ? 5006 : 0) / MATCH_DURATION_SECONDS * 100}%` }} />
        {plotted.map((event, index) => (
          <button
            key={index}
            className={`story-timeline__dot story-timeline__dot--${event.action} ${event.participant ? `story-timeline__dot--p${event.participant}` : ""}`}
            style={{ left: `${(event.clockSeconds! / MATCH_DURATION_SECONDS) * 100}%` }}
            title={`${event.clockMMSS} — ${timelineLabel(event)}`}
            aria-label={`${event.clockMMSS} — ${timelineLabel(event)}`}
          >
            {timelineDot(event)}
          </button>
        ))}
      </div>
      <div className="story-timeline__legend">
        <span><i className="story-timeline__dot story-timeline__dot--shot" />Shot</span>
        <span><i className="story-timeline__dot story-timeline__dot--corner" />Corner</span>
        <span><i className="story-timeline__dot story-timeline__dot--yellow_card" />Yellow card</span>
        <span><i className="story-timeline__dot story-timeline__dot--substitution" />Substitution</span>
        <span><i className="story-timeline__dot story-timeline__dot--halftime_finalised" />Half-time</span>
      </div>
    </div>
  );
}

function OddsSparkline() {
  const width = 640;
  const height = 160;
  const pad = 6;
  const all = oddsSeries.flatMap((point) => [point.home, point.draw, point.away]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const x = (index: number) => pad + (index / (oddsSeries.length - 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / (max - min)) * (height - pad * 2);
  const path = (key: "home" | "draw" | "away") =>
    oddsSeries.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const first = oddsSeries[0]!;
  const last = oddsSeries[oddsSeries.length - 1]!;
  return (
    <figure className="story-sparkline">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Real full-time 1X2 match-odds movement across the capture window">
        <path d={path("away")} className="spark-away" />
        <path d={path("draw")} className="spark-draw" />
        <path d={path("home")} className="spark-home" />
      </svg>
      <figcaption>
        <div><i className="spark-swatch spark-swatch--home" />Spain win <b>{first.home.toFixed(2)} → {last.home.toFixed(2)}</b></div>
        <div><i className="spark-swatch spark-swatch--draw" />Draw <b>{first.draw.toFixed(2)} → {last.draw.toFixed(2)}</b></div>
        <div><i className="spark-swatch spark-swatch--away" />Argentina win <b>{first.away.toFixed(2)} → {last.away.toFixed(2)}</b></div>
      </figcaption>
    </figure>
  );
}

function ArchitectureDiagram() {
  const [selected, setSelected] = useState(modules[2]!.name); // "data"
  const active = modules.find((module) => module.name === selected)!;
  return (
    <div className="story-arch">
      <img className="story-arch__bg" src="/story/architecture-v2.jpg" alt="" aria-hidden="true" loading="lazy" />
      <div className="story-arch__row">
        <div className="story-arch__node story-arch__node--feed"><span>TxLINE</span><strong>Raw feed</strong></div>
        <svg className="story-arch__line" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="2" x2="100" y2="2" />
          <circle className="story-arch__flow" r="1.6" cy="2"><animateMotion dur="3.5s" repeatCount="indefinite" path="M0,0 L100,0" /></circle>
        </svg>
        <div className="story-arch__modules" role="group" aria-label="SDK modules — click to see each module's role">
          {modules.map((module) => (
            <button
              key={module.name}
              className={`story-arch__module tone-${module.tone} ${selected === module.name ? "active" : ""}`}
              onClick={() => setSelected(module.name)}
            >
              <SparkMark tone={module.tone} />{module.name}
            </button>
          ))}
        </div>
        <svg className="story-arch__line" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="2" x2="100" y2="2" />
          <circle className="story-arch__flow" r="1.6" cy="2"><animateMotion dur="3.5s" repeatCount="indefinite" path="M0,0 L100,0" begin="1.2s" /></circle>
        </svg>
        <div className="story-arch__node story-arch__node--settle"><span>Solana</span><strong>Settlement</strong></div>
      </div>
      <div className="story-arch__detail" aria-live="polite">
        <code>@0xpulseplay/txline-kit/{active.name}</code>
        <p>{active.role}</p>
      </div>
    </div>
  );
}

function SettlementStrip() {
  return (
    <ol className="story-settlement">
      {settlementSteps.map((step, index) => (
        <li key={step.signature}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{step.label}</strong>
          <small>{step.detail}</small>
        </li>
      ))}
    </ol>
  );
}

export function Story() {
  const homeTicks = possessionTicks.home;
  const awayTicks = possessionTicks.away;
  const homeShare = Math.round((homeTicks / (homeTicks + awayTicks)) * 100);
  return (
    <div className="story-page">
      <header className="story-topbar">
        <Link className="story-brand" to="/" aria-label="TxLINE Kit home"><SparkMark /><strong>TxLINE</strong><span>kit</span></Link>
        <nav>
          <Link to="/">Open the app ↗</Link>
          <a href="https://github.com/0xPulsePlay/txline-kit" target="_blank" rel="noreferrer">GitHub ↗</a>
        </nav>
      </header>

      <section className="story-hero">
        <img className="story-hero__img" src="/story/header-v2.jpg" alt="Abstract schematic of a live match feed converging into an anchored Merkle proof" />
        <div className="story-hero__copy">
          <Eyebrow>Hackathon submission · 3-minute read</Eyebrow>
          <h1>A live World Cup feed, turned into a Solana settlement you can inspect.</h1>
          <p className="lede">
            TxLINE Kit is a typed integration layer that takes a live sports-data feed all the way to a proof-settled
            Solana transaction — deterministic replay, inspectable Merkle receipts, and a Rust CPI crate, so nobody
            has to hand-roll an oracle ABI again.
          </p>
          <div className="story-hero__actions">
            <a className="button button--primary" href="#live-final">See today's live match data <span>↓</span></a>
            <Link className="button button--quiet" to="/">Open the interactive app</Link>
          </div>
        </div>
      </section>

      <section className="story-section story-why">
        <div className="story-section-head"><Eyebrow>Why it matters</Eyebrow><h2>Raw feed to trustworthy settlement is three hard problems, not one.</h2></div>
        <div className="story-why-grid">
          <article>
            <span className="story-why-icon" aria-hidden="true">⏱</span>
            <h3>Proof timing</h3>
            <p>A live feed updates every second. Settlement can only trust a stat once it's provably final — settle
              a beat too early and you've paid out on a number that was still moving.</p>
          </article>
          <article>
            <span className="story-why-icon" aria-hidden="true">⌗</span>
            <h3>PDA / timestamp ambiguity</h3>
            <p>Is a timestamp seconds or milliseconds? Guess wrong and you derive the wrong on-chain root account.
              v0.2 adds an opt-in strict check that rejects a seconds-unit timestamp outright instead of silently
              deriving the wrong PDA.</p>
          </article>
          <article>
            <span className="story-why-icon" aria-hidden="true">⌬</span>
            <h3>ABI hand-rolling</h3>
            <p>Every team that wants CPI settlement either hand-transcribes the on-chain program's Anchor IDL into
              their own types, or adopts a typed crate. One real consumer did the former, then deleted it —
              see &ldquo;Used in production&rdquo; below.</p>
          </article>
        </div>
      </section>

      <section className="story-section story-how">
        <div className="story-section-head"><Eyebrow>How it works</Eyebrow><h2>Feed → nine typed modules → Solana settlement.</h2></div>
        <ArchitectureDiagram />
        <p className="story-how-note">The settlement chain below is the same finalized mainnet receipt shown in the app's Settlement screen — six transactions, from market init to rent-safe teardown.</p>
        <SettlementStrip />
      </section>

      <section id="live-final" className="story-section story-live">
        <div className="story-section-head">
          <Eyebrow>What happened during today's live final</Eyebrow>
          <h2>{captureMeta.home} v {captureMeta.away} — {captureMeta.competition}</h2>
          <p className="story-real-badge">
            <i /> REAL, live-captured data — not a mockup. Snapshot frozen {captureMeta.asOfEt}, fixture {captureMeta.fixtureId}.
          </p>
        </div>
        <div className="story-live-grid">
          <img className="story-live__img" src="/story/live-match-v2.jpg" alt="Abstract schematic pitch with pulsing event nodes along a match-clock arc" loading="lazy" />
          <div className="story-scoreline">
            <div><small>{captureMeta.home}</small><strong>Home</strong></div>
            <b>{captureMeta.scoreline}</b>
            <div><small>{captureMeta.away}</small><strong>Away</strong></div>
          </div>
          <div className="story-clock-chip">{captureMeta.clockMMSS} <span>· 2nd half, still scoreless</span></div>
          <div className="story-stat-tiles">
            <div><span>Shots</span><b>{matchStats.shots.home}–{matchStats.shots.away}</b></div>
            <div><span>Corners</span><b>{matchStats.corners.home}–{matchStats.corners.away}</b></div>
            <div><span>Yellow cards</span><b>{matchStats.yellowCards.home}–{matchStats.yellowCards.away}</b></div>
            <div><span>Substitutions</span><b>{matchStats.substitutions.home}–{matchStats.substitutions.away}</b></div>
            <div><span>Possession-state feed ticks</span><b>{homeShare}%–{100 - homeShare}%</b></div>
          </div>
        </div>
        <StoryTimeline />
        <div className="story-odds">
          <div>
            <h3>The market reacted in real time</h3>
            <p>
              {oddsMeta.totalRealPricePoints.toLocaleString()} real full-time 1X2 price updates were captured over the
              window. As Spain kept generating chances without scoring, the draw price crashed and Argentina's price
              nearly tripled — a live, traceable repricing, not a scripted demo.
            </p>
          </div>
          <OddsSparkline />
        </div>
        <p className="story-source-note">
          Source: live TxLINE capture for fixture {captureMeta.fixtureId} — {captureMeta.rawNonHeartbeatRecords} real
          non-heartbeat score records and {oddsMeta.totalRealPricePoints.toLocaleString()} real odds records captured
          as of this snapshot. Event counts above are deduplicated by the feed's own event id (each real event is
          confirmed 1–3 times on the wire); raw stream-record counts run higher.
        </p>
      </section>

      <section className="story-section story-production-wrap">
        <div className="story-section-head"><Eyebrow>Used in production</Eyebrow><h2>Not a demo claim — a real deleted file.</h2></div>
        <img className="story-production__img" src="/story/production-v2.jpg" alt="Abstract diptych of tangled lines resolving into one clean anchored node" loading="lazy" />
        <Production />
      </section>

      <section className="story-section story-try">
        <div className="story-section-head"><Eyebrow>Try it</Eyebrow><h2>Open the SDK map, or drive the app yourself.</h2></div>
        <div className="story-try-grid">
          <Link className="story-try-card" to="/#replay">
            <strong>Replay lab ↗</strong>
            <p>Scrub the real captured record stream event by event, with SHA-256 body receipts.</p>
          </Link>
          <Link className="story-try-card" to="/#strategy">
            <strong>Strategy studio ↗</strong>
            <p>Compile a total-coverage predicate and watch the compiler refuse an uncovered stat.</p>
          </Link>
          <a className="story-try-card" href="https://github.com/0xPulsePlay/txline-kit" target="_blank" rel="noreferrer">
            <strong>Source on GitHub ↗</strong>
            <p>Typed client, proofs, strategy compiler, replay, keeper, and the txline-kit-cpi Rust crate.</p>
          </a>
        </div>
      </section>

      <section className="story-section story-release">
        <div className="story-section-head"><Eyebrow>Release note</Eyebrow><h2>{releaseNote.heading}</h2></div>
        <p>
          {releaseNote.stackSize} stacked PRs are in review on top of the v0.1.0 source release, covering proof
          lifecycle attestations, a canonical journal, a local Merkle builder, implied probabilities, and
          namespace-generic PDAs. {releaseNote.testCaseCount}+ test cases across {releaseNote.testFileCount} test
          files back the stack (counted directly from the review branch). None of this has merged to <code>main</code> or
          shipped as a tagged release yet — it's in review, not released.
        </p>
        <ul className="story-release-list">
          {releaseNote.highlights.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <footer className="story-footer">
        <span>MIT OR Apache-2.0</span>
        <span>Hackathon demo · not audited · no valuable custody</span>
        <Link to="/">Back to the interactive app ↗</Link>
      </footer>
    </div>
  );
}

import { Link } from "react-router-dom";
import { Eyebrow, SparkMark } from "./Eyebrow";
import { consumersInWaiting, discoveries, recommendation, workedWell } from "./feedback-data";
import "./story.css";
import "./feedback.css";

function DiscoveryCard({ item, index }: { item: (typeof discoveries)[number]; index: number }) {
  return (
    <article className="feedback-card">
      <span className="feedback-card__index">{String(index + 1).padStart(2, "0")}</span>
      <h3>{item.title}</h3>
      <p>{item.body}</p>
    </article>
  );
}

export function Feedback() {
  return (
    <div className="feedback-page">
      <header className="story-topbar">
        <Link className="story-brand" to="/" aria-label="TxLINE Kit home"><SparkMark /><strong>TxLINE</strong><span>kit</span></Link>
        <nav>
          <Link to="/">Open the app ↗</Link>
          <Link to="/story">The story ↗</Link>
          <a href="https://github.com/0xPulsePlay/txline-kit" target="_blank" rel="noreferrer">GitHub ↗</a>
        </nav>
      </header>

      <section className="feedback-hero">
        <div className="feedback-hero__copy">
          <Eyebrow>API feedback · from building this SDK</Eyebrow>
          <h1>What we learned building against TxLINE, the hard way.</h1>
          <p className="lede">
            This is a feedback report on the TxLINE / TxODDS API, written from actually building txline-kit and
            the live /story capture against it today. Every item below is something we hit while integrating —
            not a wishlist.
          </p>
        </div>
      </section>

      <section className="story-section feedback-worked">
        <div className="story-section-head">
          <Eyebrow>{workedWell.eyebrow}</Eyebrow>
          <h2>{workedWell.heading}</h2>
        </div>
        <div className="feedback-worked-grid">
          {workedWell.points.map((point) => (
            <article key={point.label}>
              <span className="feedback-worked-icon" aria-hidden="true">✓</span>
              <h3>{point.label}</h3>
              <p>{point.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="story-section feedback-discoveries">
        <div className="story-section-head">
          <Eyebrow>What we had to discover the hard way</Eyebrow>
          <h2>Six things no doc page told us.</h2>
        </div>
        <div className="feedback-card-grid">
          {discoveries.map((item, index) => <DiscoveryCard key={item.id} item={item} index={index} />)}
        </div>
      </section>

      <section className="story-section feedback-recommendation">
        <div className="story-section-head">
          <Eyebrow>{recommendation.eyebrow}</Eyebrow>
          <h2>{recommendation.heading}</h2>
        </div>
        <p className="feedback-recommendation__body">{recommendation.body}</p>
      </section>

      <section className="story-section feedback-consumers">
        <div className="story-section-head">
          <Eyebrow>Consumers-in-waiting</Eyebrow>
          <h2>Other teams in this hackathon are hitting the same walls.</h2>
          <p className="feedback-consumers__lede">
            Every lane below builds against the same live TxLINE/TxODDS feed catalogued above. None of them need to
            rediscover the six items on this page independently — that's what this SDK is for.
          </p>
        </div>
        <ul className="feedback-consumers-grid">
          {consumersInWaiting.map((lane) => (
            <li key={lane.name} className="feedback-consumer-chip">
              {lane.url
                ? <a href={lane.url} target="_blank" rel="noreferrer">{lane.name} <span>↗</span></a>
                : <span>{lane.name}</span>}
            </li>
          ))}
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

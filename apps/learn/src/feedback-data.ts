// Feedback report on the TxLINE/TxODDS API, written from this SDK's own
// build experience. Every claim here is something the team actually hit
// while building txline-kit and the /story submission page against the
// live feed -- not a wishlist, not synthetic. See /story for the real
// World Cup Final capture this feedback is drawn from.

export interface DiscoveryItem {
  id: string;
  title: string;
  body: string;
}

export const workedWell = {
  eyebrow: "What worked well",
  heading: "Rich, real data when it's present.",
  points: [
    {
      label: "A live storytelling page, built on real data",
      detail:
        "/story on this app is built entirely off a live TxLINE capture of today's World Cup Final (Spain v Argentina, fixture 18257739) -- real shots, corners, cards, substitutions, and a real odds-market repricing as the draw price crashed and Argentina's price nearly tripled. Zero synthetic filler in that page.",
    },
    {
      label: "The free tier is a real development tier",
      detail:
        "The guest-auth path (JWT Bearer, no paid key) is not a crippled demo -- it's the same shape of data a paid integration gets. This entire SDK, including the live capture behind /story, was built against it.",
    },
  ],
};

export const discoveries: DiscoveryItem[] = [
  {
    id: "gamestate-lag",
    title: "GameState lags reality",
    body:
      'Mid-match, with Clock.Seconds actively incrementing and StatusId: 4, the top-level GameState field still read "scheduled." GameState is not a reliable live/not-live signal -- StatusId combined with Clock is the real one, and that pairing is undocumented. The SDK now derives "is this fixture live" from StatusId + Clock, never from GameState alone.',
  },
  {
    id: "unit-tags",
    title: "No unit tags on ambiguous fields",
    body:
      "Timestamps arrive as seconds or milliseconds with no field saying which. Odds prices arrive as decimal, milli-odds (times 1000), or a raw percentage -- again, no field says which. We had to build heuristic unit detection into the SDK. The percentage heuristic's first version mishandled sub-1% outcomes (extreme-underdog prices) -- a real bug in our own code that this ambiguity caused, caught and fixed before release.",
  },
  {
    id: "market-period-blend",
    title: "One SuperOddsType, multiple silent periods",
    body:
      "The same SuperOddsType (e.g. 1X2_PARTICIPANT_RESULT) carries both first-half and full-time markets, distinguished only by an easy-to-miss MarketParameters / MarketPeriod field. Read the type without checking that field and you silently blend two different markets into one \"match odds\" number.",
  },
  {
    id: "retransmission",
    title: "Undocumented wire-level retransmission",
    body:
      "The same event Id can arrive one to three times on the scores stream as the feed reconfirms it. This isn't documented anywhere -- every consumer has to discover it and build their own dedup by event Id. The /story page's event counts are deduplicated for exactly this reason; the raw stream-record counts run higher.",
  },
  {
    id: "two-header-auth",
    title: "Auth needs two headers from two sources",
    body:
      "A working request needs a guest JWT Bearer token from one endpoint and a separate static API token from another, sent as two different headers together. No single doc page shows both required together -- you find the second one only by trial and error against a rejected request.",
  },
  {
    id: "score-payload-shape",
    title: "Score payloads are inconsistent",
    body:
      "A Score payload is often empty, sometimes partial (corners-only, for instance), and only sometimes carries the full match score. Which event types carry which shape of Score is undocumented -- consumers have to probe the live feed to find out empirically, the way this SDK did.",
  },
];

export const recommendation = {
  eyebrow: "Recommendation",
  heading: "This is exactly the friction an SDK should absorb.",
  body:
    "None of the six items above are exotic -- they're the kind of integration friction every serious consumer of this feed independently rediscovers. That rediscovery is wasted, duplicated effort across every team that integrates. Absorbing it once, in one typed layer, so nobody else has to hit the same six walls again, is the reason this SDK exists.",
};

export interface ConsumerLane {
  name: string;
  url?: string;
}

// Sister lanes from this same hackathon window, each building their own
// product against the same live TxLINE/TxODDS feed this SDK integrates.
// Proofline is omitted from this list on purpose: it already adopted
// txline-kit-cpi in production (see the "Used in production" section of the
// app / /story), so it's a consumer, not a consumer-in-waiting.
//
// No fabricated links: only a link this repo can independently verify goes
// here. Every other lane is named without one -- ask the SDK team for a
// current repo/site URL rather than trusting a guessed one.
export const consumersInWaiting: ConsumerLane[] = [
  { name: "Match DNA" },
  { name: "FairWhistle" },
  { name: "TickNotary" },
  { name: "SpoilerShield" },
  { name: "CalledIt" },
  { name: "StreakBlink" },
  { name: "FairLine" },
];

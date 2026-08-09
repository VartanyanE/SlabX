import { useQuery } from "@tanstack/react-query";
import { NavLink, Route, Routes } from "react-router";
import { getApiHealth } from "./api/client";

function Home() {
  const health = useQuery({
    queryKey: ["api-health"],
    queryFn: ({ signal }) => getApiHealth(signal),
    retry: 1,
  });
  const serviceStatus = health.isSuccess
    ? "Platform online"
    : health.isError
      ? "Platform unavailable"
      : "Checking platform";

  return (
    <main id="main-content">
      <section className="hero" aria-labelledby="hero-title">
        <div className="eyebrow">THE COLLECTOR’S MARKETPLACE</div>
        <h1 id="hero-title">Great cards deserve a better marketplace.</h1>
        <p className="hero-copy">
          SlabX is being built for collectors who care about the card, the
          story, and a trustworthy deal.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href="#foundation">
            Explore the foundation
          </a>
          <a
            className="button button-secondary"
            href="https://github.com/VartanyanE/SlabX"
          >
            View the build plan
          </a>
        </div>
        <div className="status" role="status">
          <span
            className={`status-dot ${health.isError ? "status-dot-error" : ""}`}
            aria-hidden="true"
          />
          {serviceStatus}
        </div>
      </section>

      <section
        className="foundation"
        id="foundation"
        aria-labelledby="foundation-title"
      >
        <p className="section-kicker">MILESTONE 1</p>
        <h2 id="foundation-title">The foundation is in place.</h2>
        <div className="feature-grid">
          <article>
            <span>01</span>
            <h3>Mobile first</h3>
            <p>
              A fast, accessible interface designed from the smallest screen
              upward.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Built for trust</h3>
            <p>
              Safe defaults, validated configuration, and clear system
              boundaries from day one.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Ready to grow</h3>
            <p>
              A modular platform prepared for catalog, marketplace, payment, and
              shipping workflows.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

function NotFound() {
  return (
    <main id="main-content" className="not-found">
      <p className="section-kicker">404</p>
      <h1>That card isn’t here.</h1>
      <NavLink to="/">Return home</NavLink>
    </main>
  );
}

export function App() {
  return (
    <div className="page-shell">
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="SlabX home">
          <span className="brand-mark">S</span>
          <span>SLABX</span>
        </NavLink>
        <nav aria-label="Primary">
          <span>Marketplace coming soon</span>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <footer>
        <span>© 2026 SlabX</span>
        <span>Built for collectors.</span>
      </footer>
    </div>
  );
}

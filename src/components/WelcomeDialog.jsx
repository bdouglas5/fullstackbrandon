import { Play, X, Trophy } from "../icons.js";
export default function WelcomeDialog({
  loading,
  busy,
  canStart,
  jevConfigured = false,
  onClose,
  onStart,
  onAchievements,
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="help-modal welcome-dialog"
        data-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-description"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close-button"
          aria-label="Close introduction"
          onClick={onClose}
        >
          <X />
        </button>
        <div className="welcome-heading">
          <img
            className="welcome-portrait"
            src="/images/brandon-model-welcome.jpg"
            alt="Brandon’s in-game 3D model beside a pickle"
          />
          <div>
            <span className="eyebrow">
              BRANDON DOUGLAS · INTERACTIVE PORTFOLIO
            </span>
            <h2 id="welcome-title">Fullstack Brandon</h2>
          </div>
        </div>
        <div className="welcome-content">
          <p id="welcome-description" className="intro-lead">
            This is my portfolio in motion. I built Fullstack Brandon to show
            how I think, design, and build—from the 3D world you explore to the
            systems that keep it running.
          </p>
          <div className="welcome-loop" aria-label="How the business grows">
            <span>Deliver</span>
            <i aria-hidden="true">→</i>
            <span>Earn</span>
            <i aria-hidden="true">→</i>
            <span>Build</span>
          </div>
          <p>
            <b>One courier. An entire business to build.</b>
            <br />
            Brandon starts on foot. Deliveries fund better transport, gadgets, a
            crew, and eventually a pickle factory. Every purchase and journey
            has a cost.
          </p>
          <p>
            <b>
              {jevConfigured
                ? "AI makes the next move."
                : "Rules guide the next move."}
            </b>
            <br />
            {jevConfigured ? "AI weighs" : "The rules controller weighs"} stock,
            earnings, weather, and past outcomes to choose jobs and investments.
            The simulation enforces what is possible—and records what each
            choice changes.
          </p>
          <p>
            <b>You can change the story.</b>
            <br />
            Suggest an investment, introduce a setback, or follow Brandon. Open
            Decisions to see the choices and results, and Achievements to
            explore what he can build toward.
          </p>
          <p className="welcome-note-text">
            A working system you can explore, influence, and inspect. Customers,
            money, and reviews are simulated.{" "}
            {jevConfigured
              ? "The business keeps moving if AI is unavailable."
              : "This world runs with the rules controller; no live AI service is connected."}
          </p>
        </div>
        <div className="welcome-actions">
          <button
            className="primary-button"
            onClick={onStart}
            disabled={loading || busy || !canStart}
          >
            <Play size={16} />
            {loading
              ? "Preparing the island…"
              : busy
                ? "Starting…"
                : "Start the simulation"}
          </button>
          <button className="secondary-button" onClick={onAchievements}>
            <Trophy size={16} />
            Achievements
          </button>
        </div>
      </section>
    </div>
  );
}

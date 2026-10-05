import { Sparkles, MessageCircle, Check } from "../icons.js";

export default function LearningPanel({ state }) {
  const memory = state.learning || {};
  const lessons = Object.values(memory.lessons || {});
  const feedback = memory.feedback || [];
  return (
    <section className="operations-panel" aria-label="Learning from experience">
      <div className="console-heading">
        <p>
          Brandon remembers outcomes and listens to the people around him. Jev
          receives these saved observations with each new decision.
        </p>
        <b>{memory.evaluatedDecisions || 0} outcomes observed</b>
      </div>
      <div className="operations-section">
        <div className="operation-heading">
          <div>
            <span className="eyebrow">A VISIBLE LEARNING PROCESS</span>
            <h3>Observe. Adjust. Try again.</h3>
          </div>
          <Sparkles size={23} />
        </div>
        <ol className="supply-pipeline">
          <li>
            <span>01</span>
            <b>Listen</b>
            <small>Customers, crew, and visitors</small>
          </li>
          <li>
            <span>02</span>
            <b>Remember</b>
            <small>Recorded decisions and outcomes</small>
          </li>
          <li>
            <span>03</span>
            <b>Adapt</b>
            <small>Legal routes, reserves, and equipment</small>
          </li>
          <li>
            <span>04</span>
            <b>Check</b>
            <small>Look for a later recovery</small>
          </li>
        </ol>
        <div className="learning-plan">
          <span>
            Stock buffer <b>{memory.plan?.reorderPoint || 2} cases</b>
          </span>
          <span>
            Battery reserve <b>{memory.plan?.chargeReserve || 15}%</b>
          </span>
          <span>
            Wage reserve <b>{memory.plan?.payrollDays || 1} day(s)</b>
          </span>
        </div>
        <p className="console-note">
          Persistent decision memory, not model retraining. Rules identify
          incidents and adjust bounded operating thresholds; Jev considers that
          evidence when choosing. A later recovery is an observation, not proof
          that a lesson caused it. Breaks, budgets, closures, and vehicle
          ownership still apply.
        </p>
      </div>
      <div className="operations-section">
        <div className="operation-heading">
          <div>
            <span className="eyebrow">EXPERIENCE INTO ACTION</span>
            <h3>Lessons from this business.</h3>
          </div>
        </div>
        {lessons.length ? (
          <div className="learning-lessons">
            {lessons.map((lesson) => (
              <article key={lesson.key}>
                <div>
                  <h4>{lesson.title}</h4>
                  <span className="operation-status">
                    {lesson.status === "recovery observed" && (
                      <Check size={12} />
                    )}
                    {lesson.status}
                  </span>
                </div>
                <p>{lesson.change}</p>
                <blockquote>{lesson.evidence}</blockquote>
                <small>
                  {lesson.occurrences} observation(s) · {lesson.recoveries}{" "}
                  recovery observation(s) · {lesson.source}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <p className="console-note">
            No incident-based lessons yet. They appear after an observed
            stockout, route disruption, wage problem, or disappointing customer
            review.
          </p>
        )}
      </div>
      <div className="operations-section">
        <div className="operation-heading">
          <div>
            <span className="eyebrow">HEAR THE PEOPLE</span>
            <h3>Feedback that informs the plan.</h3>
          </div>
          <MessageCircle size={23} />
        </div>
        {feedback.length ? (
          <ul className="learning-feedback">
            {feedback
              .slice()
              .reverse()
              .map((item, i) => (
                <li key={`${item.tick}-${i}`}>
                  <b>
                    {item.name ||
                      (item.source === "visitor"
                        ? "Visitor"
                        : item.source === "employee"
                          ? "The crew"
                          : "Customer")}
                    <span>
                      {item.source}
                      {item.rating ? ` · ${item.rating}/5` : ""}
                    </span>
                  </b>
                  <p>{item.text}</p>
                </li>
              ))}
          </ul>
        ) : (
          <p className="console-note">
            Customer reviews, employee concerns, and your dispatch suggestions
            will appear here as the business runs.
          </p>
        )}
      </div>
    </section>
  );
}

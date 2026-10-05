import { Code2 } from "../icons.js";
export default function AboutPanel({ setPanel }) {
  return (
    <>
      <span className="big-monogram">B.</span>
      <h2>Hi. I’m Brandon Douglas.</h2>
      <p className="drawer-intro">
        I build things people can explore and understand.
      </p>
      <p>
        I designed and built this simulation: the island, the business, the
        controls, and the AI that chooses what to do next.
      </p>
      <p>
        Every delivery changes the business. Close a road, choose a new
        priority, or suggest a purchase, then follow the result. You can inspect
        each decision and replay the run.
      </p>
      <button
        className="primary-button"
        onClick={() => setPanel("engineering")}
      >
        See how I built it <Code2 size={17} />
      </button>
    </>
  );
}

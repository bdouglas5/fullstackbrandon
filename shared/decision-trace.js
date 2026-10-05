import { ACTIONS, baseline, legal, nearestOrder, reason } from "./engine.js";
import { learningContext } from "./learning.js";

// The same candidate filter used by the provider, with no invented reasoning.
export function decisionOptions(s) {
  const nearest = nearestOrder(s);
  return legal(s).filter(
    (action) =>
      !action.startsWith("serve_") ||
      action === (nearest && `serve_${nearest.customerId}`) ||
      action === s.request,
  );
}
export function decisionTrace(s) {
  const recommended = baseline(s);
  const experience = learningContext(s);
  return {
    tick: s.tick,
    recommended,
    objective:
      s.objective === "waste"
        ? "Reduce waste and build sustainably"
        : "Deliver on time and grow sustainably",
    signals: [
      { label: "Cash available", value: `${Math.floor(s.money)} coins` },
      { label: "Ready to deliver", value: `${s.carry} cases` },
      { label: "Packing room", value: `${s.cafe} cases` },
      { label: "Waiting orders", value: `${s.customerQueue?.length || 0}` },
      { label: "Battery", value: `${Math.round(s.battery ?? 100)}%` },
      {
        label: "Weather / road",
        value: `${s.storm ? "Rain" : "Clear"} · ${s.traffic || s.bridgeClosed ? "Detour" : "Open"}`,
      },
    ],
    options: decisionOptions(s).map((action) => ({
      action,
      label: ACTIONS[action].label,
      reason: reason(s, action),
    })),
    lessons: experience.lessons.map(
      ({ key, title, change, evidence, status }) => ({
        key,
        title,
        change,
        evidence,
        status,
      }),
    ),
    feedback: experience.feedback.slice(-3),
    plan: { ...experience.adaptivePlan },
  };
}

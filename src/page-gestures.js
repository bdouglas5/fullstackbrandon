// A trackpad pinch arrives as Ctrl+wheel in Chromium and gesture events in
// Safari. Consume browser zoom everywhere; ordinary panel scrolling and the
// island's own OrbitControls wheel handler continue to work normally.
export function lockPageGestures(target = document) {
  const wheel = (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  };
  const gesture = (event) => event.preventDefault();
  const key = (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      ["+", "=", "-", "0"].includes(event.key)
    )
      event.preventDefault();
  };
  const options = { capture: true, passive: false };
  target.addEventListener("wheel", wheel, options);
  target.addEventListener("keydown", key, options);
  for (const type of ["gesturestart", "gesturechange", "gestureend"])
    target.addEventListener(type, gesture, options);
  return () => {
    target.removeEventListener("wheel", wheel, options);
    target.removeEventListener("keydown", key, options);
    for (const type of ["gesturestart", "gesturechange", "gestureend"])
      target.removeEventListener(type, gesture, options);
  };
}

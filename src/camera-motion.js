import { Vector3 } from "three";

// Integrate exponential easing so movement feels the same at 30 and 60 fps.
export function createCameraMotion() {
  const velocity = new Vector3();
  const desired = new Vector3();
  const shift = new Vector3();
  return {
    stop() {
      velocity.set(0, 0, 0);
    },
    advance(direction, distance, dt, reducedMotion = false) {
      const speed = Math.min(22, Math.max(2, distance * 0.22));
      desired.copy(direction).normalize().multiplyScalar(speed);
      if (reducedMotion) {
        velocity.copy(desired);
        return shift.copy(velocity).multiplyScalar(dt);
      }
      const rate = 6;
      const decay = Math.exp(-rate * dt);
      const travel = (1 - decay) / rate;
      shift
        .copy(velocity)
        .multiplyScalar(travel)
        .addScaledVector(desired, dt - travel);
      velocity.lerp(desired, 1 - decay);
      if (!desired.lengthSq() && velocity.length() < 0.015)
        velocity.set(0, 0, 0);
      return shift;
    },
    get speed() {
      return velocity.length();
    },
  };
}

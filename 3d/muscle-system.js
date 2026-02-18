/**
 * Muscle system — drives HingeConstraint motors with sinusoidal oscillation.
 *
 * Based on the proven pattern from cannon-es hinge examples and
 * genetic walker demos: each joint gets
 *   motorSpeed(t) = amplitude * sin(frequency * t + phaseOffset)
 *
 * Three gait patterns auto-selected from morphology:
 *   wiggle  — traveling lateral wave (fish-like undulation)
 *   crawl   — alternating leg pairs with phase offsets
 *   pulse   — synchronized radial expansion/contraction
 */

const TWO_PI = Math.PI * 2;

export class MuscleSystem {
  constructor(skeleton, gait = 'pulse', options = {}) {
    this.skeleton = skeleton;
    this.gait = gait;
    this.amplitude = options.amplitude ?? 3;   // Motor speed amplitude (rad/s)
    this.frequency = options.frequency ?? 2.0; // Oscillation Hz
    this.enabled = true;
    this.settleTime = 0.8; // Let physics settle before activating
  }

  setGait(gait) {
    this.gait = gait;
  }

  /**
   * Update motor speeds on all joints. Call once per frame.
   * @param {number} elapsed - Total elapsed seconds
   */
  update(elapsed) {
    if (!this.enabled || elapsed < this.settleTime) return;

    const t = elapsed - this.settleTime;
    const { jointMeta } = this.skeleton;
    const freq = this.frequency;
    const amp = this.amplitude;

    for (const jm of jointMeta) {
      const flex = jm.flexibility ?? 0.5;
      const side = jm.side;
      const normY = jm.normY;
      const segIdx = jm.segIndex ?? 0;
      const numSegs = this.skeleton.segCount;
      let speed = 0;

      switch (this.gait) {
        case 'wiggle': {
          // Traveling wave down the body: phase offset by Y position
          const phase = normY * TWO_PI;
          const wave = Math.sin(freq * TWO_PI * t + phase);
          // Side multiplier: left branches swing opposite to right
          const sideMul = side !== 0 ? side : 1;
          speed = wave * amp * (0.4 + flex * 0.6) * sideMul;
          break;
        }

        case 'crawl': {
          if (jm.isSpine) {
            // Spine compresses/extends in sequence
            const phase = (segIdx * Math.PI) / Math.max(numSegs, 1);
            speed = Math.sin(freq * TWO_PI * t + phase) * amp * 0.7;
          } else {
            // Legs swing with segment-based phase offset
            // Diagonal pairs share phase (trot gait)
            const legPhase = (segIdx * Math.PI) / Math.max(numSegs, 1);
            const sidePhase = side > 0 ? 0 : Math.PI; // Left/right alternate
            const wave = Math.sin(freq * TWO_PI * t + legPhase + sidePhase);
            speed = wave * amp * (0.5 + flex * 0.5);
          }
          break;
        }

        case 'pulse':
        default: {
          // All joints oscillate together, same phase
          const pulse = Math.sin(freq * TWO_PI * t);
          speed = pulse * amp * (0.4 + flex * 0.6);
          break;
        }
      }

      jm.constraint.setMotorSpeed(speed);
    }
  }

  dispose() {
    for (const jm of this.skeleton.jointMeta) {
      jm.constraint.disableMotor();
    }
  }
}

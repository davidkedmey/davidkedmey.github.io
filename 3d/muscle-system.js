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
    this.amplitude = options.amplitude ?? 3;       // Motor speed amplitude (rad/s)
    this.frequency = options.frequency ?? 2.0;     // Oscillation Hz
    this.phaseSpread = options.phaseSpread ?? 1.0;  // Multiplier on inter-segment phase offset
    this.asymmetry = options.asymmetry ?? 0;        // Left/right phase offset (-1 to 1)
    // Tier 2: regional differentiation
    this.spineGain = options.spineGain ?? 1.0;      // Amplitude multiplier for spine joints (0-2)
    this.legGain = options.legGain ?? 1.0;          // Amplitude multiplier for leg/branch joints (0-2)
    this.depthFalloff = options.depthFalloff ?? 0;  // Amplitude reduction per depth level (0=uniform, 1=strong)
    // Compute max depth from joint metadata for falloff normalization
    this.maxDepth = 1;
    for (const jm of skeleton.jointMeta) {
      if ((jm.depth ?? 0) > this.maxDepth) this.maxDepth = jm.depth;
    }
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
    const spread = this.phaseSpread;
    const asymOffset = this.asymmetry * Math.PI;

    for (const jm of jointMeta) {
      const flex = jm.flexibility ?? 0.5;
      const side = jm.side;
      const normY = jm.normY;
      const segIdx = jm.segIndex ?? 0;
      const numSegs = this.skeleton.segCount;
      let speed = 0;

      // Asymmetry: left side gets phase shift, right gets opposite
      const sideAsym = side < 0 ? asymOffset : side > 0 ? -asymOffset : 0;

      switch (this.gait) {
        case 'wiggle': {
          // Traveling wave: spread controls wavelength
          const phase = normY * TWO_PI * spread;
          const wave = Math.sin(freq * TWO_PI * t + phase + sideAsym);
          const sideMul = side !== 0 ? side : 1;
          speed = wave * amp * (0.4 + flex * 0.6) * sideMul;
          break;
        }

        case 'crawl': {
          if (jm.isSpine) {
            const phase = (segIdx * Math.PI * spread) / Math.max(numSegs, 1);
            speed = Math.sin(freq * TWO_PI * t + phase) * amp * 0.7;
          } else {
            const legPhase = (segIdx * Math.PI * spread) / Math.max(numSegs, 1);
            const sidePhase = side > 0 ? 0 : Math.PI;
            const wave = Math.sin(freq * TWO_PI * t + legPhase + sidePhase + sideAsym);
            speed = wave * amp * (0.5 + flex * 0.5);
          }
          break;
        }

        case 'pulse':
        default: {
          // Spread adds segment-based offset (0=all sync, higher=wave)
          const segPhase = numSegs > 1
            ? (segIdx * Math.PI * spread) / Math.max(numSegs, 1)
            : 0;
          const pulse = Math.sin(freq * TWO_PI * t + segPhase + sideAsym);
          speed = pulse * amp * (0.4 + flex * 0.6);
          break;
        }
      }

      // Tier 2: regional gain — spine vs leg amplitude
      const regionGain = jm.isSpine ? this.spineGain : this.legGain;

      // Tier 2: depth falloff — deeper joints get weaker
      // depth 0 = full strength, each level reduces by falloff factor
      const depth = jm.depth ?? 0;
      const depthScale = 1 - this.depthFalloff * (depth / this.maxDepth);
      const depthGain = Math.max(depthScale, 0.05); // never fully zero

      jm.constraint.setMotorSpeed(speed * regionGain * depthGain);
    }
  }

  dispose() {
    for (const jm of this.skeleton.jointMeta) {
      jm.constraint.disableMotor();
    }
  }
}

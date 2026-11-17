/**
 * Shared "atmosphere" — a tiny one-directional channel: the wire wordmark
 * writes pluck energy, the ink-wash field reads it. Loosely coupled.
 */
export const atmosphere = {
  pluckEnergy: 0,
  /** last pluck position, 0..1 across the footer */
  pluckX: 0.5,
  pluck(strength: number, x: number) {
    this.pluckEnergy = Math.min(1.5, this.pluckEnergy + strength)
    this.pluckX = x
  },
}

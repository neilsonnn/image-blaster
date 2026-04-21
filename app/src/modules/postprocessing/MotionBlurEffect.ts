import { Effect } from 'postprocessing'
import * as THREE from 'three'

const fragment = /* glsl */ `
  uniform float uStrength;
  uniform vec2 uVelocity;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 color = inputColor;
    vec2 offset = uVelocity * uStrength;
    int samples = 8;
    for (int i = 1; i <= 8; i++) {
      color += texture2D(inputBuffer, uv - offset * float(i) / 8.0);
    }
    outputColor = color / 9.0;
  }
`

export class MotionBlurEffect extends Effect {
  constructor() {
    const uniforms = new Map<string, THREE.Uniform<unknown>>([
      ['uStrength', new THREE.Uniform(0.0)],
      ['uVelocity', new THREE.Uniform(new THREE.Vector2())],
    ])
    super('MotionBlurEffect', fragment, { uniforms })
  }

  setVelocity(dx: number, dy: number, strength: number) {
    const u = this.uniforms
    ;(u.get('uVelocity')!.value as THREE.Vector2).set(dx, dy)
    u.get('uStrength')!.value = strength
  }
}

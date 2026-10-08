import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LensShader } from '../fx/LensShader.js';

export class Engine {
  constructor(canvas, quality = 'high') {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2600);
    this.resizeHooks = [];

    this.setQuality(quality);
    addEventListener('resize', () => this.resize());
  }

  get gl() {
    return this.renderer.getContext();
  }

  setQuality(quality) {
    this.quality = quality;
    const high = quality === 'high';
    this.pixelRatio = Math.min(devicePixelRatio || 1, high ? 1.75 : 1);

    if (this.composer) {
      this.composer.dispose();
      this.bloom.dispose();
      this.lens.dispose();
    }

    const target = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      samples: high ? 4 : 0,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Threshold sits above the sky so only emissive geometry blooms.
    this.bloomBase = high ? 0.7 : 0.6;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.bloomBase, 0.45, 0.8);
    this.composer.addPass(this.bloom);

    this.lens = new ShaderPass(LensShader);
    this.composer.addPass(this.lens);
    this.composer.addPass(new OutputPass());

    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.lens.uniforms.uRes.value.set(w * this.pixelRatio, h * this.pixelRatio);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const fn of this.resizeHooks) fn(w, h, this.pixelRatio);
  }

  // Used by the adaptive quality check when the frame rate drops.
  setPixelRatio(pr) {
    this.pixelRatio = pr;
    this.resize();
  }

  onResize(fn) {
    this.resizeHooks.push(fn);
  }

  render(dt) {
    this.composer.render(dt);
  }
}

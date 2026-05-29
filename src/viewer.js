import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeObject } from './materials.js';

const VIEWPORT = 600;

export function createViewer(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(VIEWPORT, VIEWPORT);
  // Cap at 1.5 on the fixed 600x600 panel: ~40% fewer shaded fragments than 2.0
  // with no visible loss at this size — headroom for the display modes + glow.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(2, 2, 3);
  scene.add(dir);

  let currentModel = null;
  let mixer = null;     // THREE.AnimationMixer when the glb ships clips
  let clips = [];       // gltf.animations

  function fitObjectToView(object3D) {
    // Normalize to identity transform before measuring so the box reflects local geometry.
    object3D.position.set(0, 0, 0);
    object3D.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(object3D);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 1.6;
    const scale = targetSize / maxDim;
    object3D.scale.setScalar(scale);

    // World centroid after scaling is scale * center_local. Translate by -scale*center to land on origin.
    object3D.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  }

  function setCurrentModel(object3D) {
    if (currentModel) {
      scene.remove(currentModel);
      // Free GPU memory for the model being replaced (geometry/materials/textures).
      disposeObject(currentModel);
    }
    if (mixer) {
      mixer.stopAllAction();
      mixer = null;
    }
    clips = [];
    currentModel = object3D;
    fitObjectToView(currentModel);
    scene.add(currentModel);
  }

  function loadFallbackCube() {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.6,
    });
    const cube = new THREE.Mesh(geom, mat);
    setCurrentModel(cube);
    return cube;
  }

  async function loadModel(url) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          setCurrentModel(gltf.scene);
          // Capture animation clips (previously parsed then discarded). The
          // mixer is built against the live scene graph; main.js drives it.
          if (gltf.animations && gltf.animations.length) {
            clips = gltf.animations;
            mixer = new THREE.AnimationMixer(gltf.scene);
          }
          resolve(gltf.scene);
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  function render() {
    renderer.render(scene, camera);
  }

  function getModel() {
    return currentModel;
  }

  function getClips() {
    return clips;
  }

  function getMixer() {
    return mixer;
  }

  function updateMixer(dt) {
    if (mixer) mixer.update(dt);
  }

  return {
    loadModel,
    loadFallbackCube,
    render,
    getModel,
    getClips,
    getMixer,
    updateMixer,
    scene,
    camera,
    renderer,
  };
}

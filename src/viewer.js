import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const VIEWPORT = 600;

export function createViewer(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(VIEWPORT, VIEWPORT);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(2, 2, 3);
  scene.add(dir);

  let currentModel = null;

  function fitObjectToView(object3D) {
    const box = new THREE.Box3().setFromObject(object3D);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    object3D.position.x -= center.x;
    object3D.position.y -= center.y;
    object3D.position.z -= center.z;

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 1.6;
    const scale = targetSize / maxDim;
    object3D.scale.setScalar(scale);
  }

  function setCurrentModel(object3D) {
    if (currentModel) {
      scene.remove(currentModel);
    }
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

  return {
    loadModel,
    loadFallbackCube,
    render,
    getModel,
    scene,
    camera,
    renderer,
  };
}

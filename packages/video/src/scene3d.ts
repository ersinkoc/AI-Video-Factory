import type { SceneThree } from "@ys/core";
import {
  AmbientLight, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute,
  Group, IcosahedronGeometry, InstancedMesh, LineBasicMaterial, LineSegments,
  Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Scene, SphereGeometry, TorusGeometry,
} from "three";

/** Build once, sample at absolute time, dispose once. No clock, ticker, network or simulation state. */
export function createScene3D(spec: SceneThree) {
  const scene = new Scene();
  const root = new Group();
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  const primary = new MeshStandardMaterial({ color: spec.color, metalness: 0.45, roughness: 0.3, wireframe: spec.wireframe });
  const accent = new MeshStandardMaterial({ color: spec.accent, emissive: new Color(spec.accent), emissiveIntensity: 0.25, roughness: 0.4, wireframe: spec.wireframe });
  const sphere = new SphereGeometry(1, 20, 16);
  const torus = new TorusGeometry(1.45, 0.018, 8, 80);
  const crystal = new IcosahedronGeometry(1.4, 0);
  const lines = new LineBasicMaterial({ color: spec.color, transparent: true, opacity: 0.4 });
  const links = new BufferGeometry();
  const updates: ((t: number) => void)[] = [];
  const ball = (radius: number, useAccent = false) => {
    const mesh = new Mesh(sphere, useAccent ? accent : primary);
    mesh.scale.setScalar(radius);
    root.add(mesh);
    return mesh;
  };
  const ring = (radius: number, x: number, y: number) => {
    const mesh = new Mesh(torus, primary);
    mesh.scale.setScalar(radius / 1.45);
    mesh.rotation.set(x, y, 0);
    root.add(mesh);
    return mesh;
  };
  switch (spec.preset) {
    case "atom":
      ball(0.35, true);
      for (let i = 0; i < 3; i++) {
        const orbit = new Group();
        orbit.rotation.set(i * Math.PI / 3, i * Math.PI / 4, 0);
        root.add(orbit);
        orbit.add(new Mesh(torus, primary));
        const electron = new Mesh(sphere, accent);
        electron.scale.setScalar(0.12);
        orbit.add(electron);
        updates.push((t) => electron.position.set(Math.cos(t * 1.4 + i * 2) * 1.45, Math.sin(t * 1.4 + i * 2) * 1.45, 0));
      }
      break;
    case "solar_system":
      ball(0.4, true);
      for (let i = 0; i < 4; i++) {
        const radius = 0.72 + i * 0.36;
        ring(radius, Math.PI / 2, 0);
        const planet = ball(0.075 + i * 0.025, i % 2 === 0);
        updates.push((t) => planet.position.set(Math.cos(t / (i + 1) + i) * radius, 0, Math.sin(t / (i + 1) + i) * radius));
      }
      break;
    case "network": {
      const positions = Array.from({ length: 16 }, (_, i) => {
        const a = i * 2.399963;
        const y = 1 - (2 * i) / 15;
        const radius = Math.sqrt(1 - y * y);
        return [Math.cos(a) * radius * 1.45, y * 1.45, Math.sin(a) * radius * 1.45] as const;
      });
      const edges: number[] = [];
      positions.forEach((pos, i) => {
        const node = ball(0.09, i % 3 === 0);
        node.position.set(...pos);
        positions.slice(i + 1).forEach((other) => {
          if (Math.hypot(...pos.map((v, k) => v - other[k]!)) < 1.65) edges.push(...pos, ...other);
        });
        updates.push((t) => node.scale.setScalar(0.09 * (1 + 0.18 * Math.sin(t * 2 + i))));
      });
      links.setAttribute("position", new Float32BufferAttribute(edges, 3));
      root.add(new LineSegments(links, lines));
      break;
    }
    case "crystal": {
      const mesh = new Mesh(crystal, primary);
      mesh.scale.set(0.8, 1.2, 0.8);
      root.add(mesh);
      ring(1.8, Math.PI / 2, 0.3);
      break;
    }
    case "orbital_rings":
      ball(0.34, true);
      for (let i = 0; i < 4; i++) {
        const mesh = ring(0.8 + i * 0.3, i * 0.7, i * 0.4);
        updates.push((t) => mesh.rotation.set(i * 0.7 + t * (0.2 + i * 0.08), i * 0.4 + t * 0.3, t * 0.1));
      }
      break;
    case "wave_grid": {
      const grid = new InstancedMesh(sphere, primary, 225);
      const dummy = new Object3D();
      root.add(grid);
      updates.push((t) => {
        for (let i = 0; i < 225; i++) {
          const x = ((i % 15) - 7) * 0.22;
          const z = (Math.floor(i / 15) - 7) * 0.22;
          dummy.position.set(x, Math.sin(Math.hypot(x, z) * 4 - t * 2) * 0.25, z);
          dummy.scale.setScalar(0.045);
          dummy.updateMatrix();
          grid.setMatrixAt(i, dummy.matrix);
        }
        grid.instanceMatrix.needsUpdate = true;
      });
      break;
    }
  }
  const light = new DirectionalLight(0xffffff, 3);
  light.position.set(3, 4, 5);
  const rim = new DirectionalLight(spec.accent, 2);
  rim.position.set(-3, 1, -2);
  scene.add(root, light, rim, new AmbientLight(0xffffff, 1.4));
  return {
    scene, camera,
    sample(time: number, progress: number) {
      root.rotation.set(0.16, time * 0.16, 0);
      for (const update of updates) update(time);
      const angle = spec.camera === "orbit" ? time * 0.12 : 0;
      const distance = spec.camera === "push_in" ? 7.4 - progress * 1.2 : 7;
      camera.position.set(Math.sin(angle) * distance, spec.preset === "wave_grid" || spec.preset === "solar_system" ? 3.8 : 1.3, Math.cos(angle) * distance);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      scene.updateMatrixWorld(true);
    },
    dispose() {
      root.traverse((object) => { if (object instanceof InstancedMesh) object.dispose(); });
      for (const resource of [sphere, torus, crystal, links, primary, accent, lines]) resource.dispose();
      scene.clear();
    },
  };
}

import { useRef, useState, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import "./index.css";

// Safe expression evaluator for 3D
function createFieldFunction3D(expression: string): (x: number, y: number, z: number) => number {
  try {
    const func = new Function('x', 'y', 'z', 'Math', `
      'use strict';
      return ${expression};
    `);

    return (x: number, y: number, z: number) => {
      try {
        const result = func(x, y, z, Math);
        return typeof result === 'number' && isFinite(result) ? result : 0;
      } catch {
        return 0;
      }
    };
  } catch {
    return () => 0;
  }
}

interface VectorFieldPreset3D {
  name: string;
  fx: string;
  fy: string;
  fz: string;
  description: string;
}

const presets3D: VectorFieldPreset3D[] = [
  { name: "Rotational (Z-axis)", fx: "-y", fy: "x", fz: "0", description: "Rotation around Z axis" },
  { name: "Radial Outward", fx: "x", fy: "y", fz: "z", description: "Expanding from origin" },
  { name: "Radial Inward", fx: "-x", fy: "-y", fz: "-z", description: "Contracting to origin" },
  { name: "Helical", fx: "-y", fy: "x", fz: "0.5", description: "Helical flow upward" },
  { name: "Saddle 3D", fx: "x", fy: "-y", fz: "0", description: "Hyperbolic in XY plane" },
  { name: "Spiral Vortex", fx: "-y + 0.1*z", fy: "x + 0.1*z", fz: "-0.1*(x*x + y*y)", description: "Spiral with downward pull" },
];

interface ArrowData {
  position: [number, number, number];
  direction: [number, number, number];
  magnitude: number;
}

interface VectorArrowsProps {
  fx: string;
  fy: string;
  fz: string;
  gridSize: number;
  range: number;
}

function VectorArrows({ fx, fy, fz, gridSize, range }: VectorArrowsProps) {
  const arrows = useMemo(() => {
    const Fx = createFieldFunction3D(fx);
    const Fy = createFieldFunction3D(fy);
    const Fz = createFieldFunction3D(fz);

    const arrowData: ArrowData[] = [];
    const step = (2 * range) / gridSize;

    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        for (let k = 0; k <= gridSize; k++) {
          const x = -range + i * step;
          const y = -range + j * step;
          const z = -range + k * step;

          const vx = Fx(x, y, z);
          const vy = Fy(x, y, z);
          const vz = Fz(x, y, z);

          if (!isFinite(vx) || !isFinite(vy) || !isFinite(vz)) continue;

          const magnitude = Math.sqrt(vx * vx + vy * vy + vz * vz);
          if (magnitude < 0.01) continue;

          arrowData.push({
            position: [x, y, z],
            direction: [vx, vy, vz],
            magnitude,
          });
        }
      }
    }

    return arrowData;
  }, [fx, fy, fz, gridSize, range]);

  return (
    <group>
      {arrows.map((arrow, idx) => (
        <Arrow
          key={idx}
          position={arrow.position}
          direction={arrow.direction}
          magnitude={arrow.magnitude}
        />
      ))}
    </group>
  );
}

interface ArrowProps {
  position: [number, number, number];
  direction: [number, number, number];
  magnitude: number;
}

function Arrow({ position, direction, magnitude }: ArrowProps) {
  const arrowRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!arrowRef.current) return;

    const dir = new THREE.Vector3(...direction).normalize();
    const origin = new THREE.Vector3(...position);

    // Calculate rotation
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, dir);
    arrowRef.current.setRotationFromQuaternion(quaternion);
    arrowRef.current.position.set(...position);
  }, [position, direction]);

  const length = Math.min(magnitude * 0.3, 0.5);
  const headLength = length * 0.25;
  const headWidth = 0.03;
  const shaftWidth = 0.015;

  // Color based on magnitude
  const color = new THREE.Color().setHSL(0.6 - magnitude * 0.3, 0.8, 0.5);

  return (
    <group ref={arrowRef}>
      {/* Shaft */}
      <mesh position={[0, length / 2, 0]}>
        <cylinderGeometry args={[shaftWidth, shaftWidth, length - headLength, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Head */}
      <mesh position={[0, length - headLength / 2, 0]}>
        <coneGeometry args={[headWidth, headLength, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

interface Particle3D {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
}

interface ParticleSystemProps {
  fx: string;
  fy: string;
  fz: string;
  range: number;
  count: number;
  isAnimating: boolean;
  speed: number;
}

function ParticleSystem({ fx, fy, fz, range, count, isAnimating, speed }: ParticleSystemProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const particlesRef = useRef<Particle3D[]>([]);

  const Fx = useMemo(() => createFieldFunction3D(fx), [fx]);
  const Fy = useMemo(() => createFieldFunction3D(fy), [fy]);
  const Fz = useMemo(() => createFieldFunction3D(fz), [fz]);

  // Initialize particles
  useEffect(() => {
    particlesRef.current = Array.from({ length: count }, () => ({
      position: new THREE.Vector3(
        (Math.random() * 2 - 1) * range,
        (Math.random() * 2 - 1) * range,
        (Math.random() * 2 - 1) * range
      ),
      velocity: new THREE.Vector3(0, 0, 0),
      life: Math.random(),
    }));
  }, [count, range]);

  useFrame((state, delta) => {
    if (!isAnimating || !pointsRef.current) return;

    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const colors = pointsRef.current.geometry.attributes.color.array as Float32Array;

    particlesRef.current.forEach((particle, i) => {
      const { x, y, z } = particle.position;

      // Update velocity based on field
      const vx = Fx(x, y, z);
      const vy = Fy(x, y, z);
      const vz = Fz(x, y, z);

      if (isFinite(vx) && isFinite(vy) && isFinite(vz)) {
        particle.position.x += vx * delta * speed;
        particle.position.y += vy * delta * speed;
        particle.position.z += vz * delta * speed;
      }

      // Update life
      particle.life -= delta * 0.3 * speed;

      // Respawn if dead or out of bounds
      if (particle.life <= 0 ||
          Math.abs(particle.position.x) > range ||
          Math.abs(particle.position.y) > range ||
          Math.abs(particle.position.z) > range) {
        particle.position.set(
          (Math.random() * 2 - 1) * range,
          (Math.random() * 2 - 1) * range,
          (Math.random() * 2 - 1) * range
        );
        particle.life = 1;
      }

      // Update geometry
      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;

      // Update color based on life
      const alpha = particle.life;
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
      colors[i * 3] *= alpha;
      colors[i * 3 + 1] *= alpha;
      colors[i * 3 + 2] *= alpha;
    });

    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.geometry.attributes.color.needsUpdate = true;
  });

  const particlesGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * range;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * range;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * range;
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    return geometry;
  }, [count, range]);

  return (
    <points ref={pointsRef} geometry={particlesGeometry}>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}

interface VolumetricFieldProps {
  fx: string;
  fy: string;
  fz: string;
  range: number;
  resolution: number;
}

function VolumetricField({ fx, fy, fz, range, resolution }: VolumetricFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const { positions, colors, count } = useMemo(() => {
    const Fx = createFieldFunction3D(fx);
    const Fy = createFieldFunction3D(fy);
    const Fz = createFieldFunction3D(fz);

    const positions: number[] = [];
    const colors: number[] = [];
    const step = (2 * range) / resolution;
    let maxMagnitude = 0;

    // First pass: calculate positions and find max magnitude
    const magnitudes: number[] = [];
    for (let i = 0; i <= resolution; i++) {
      for (let j = 0; j <= resolution; j++) {
        for (let k = 0; k <= resolution; k++) {
          const x = -range + i * step;
          const y = -range + j * step;
          const z = -range + k * step;

          const vx = Fx(x, y, z);
          const vy = Fy(x, y, z);
          const vz = Fz(x, y, z);

          if (!isFinite(vx) || !isFinite(vy) || !isFinite(vz)) continue;

          const magnitude = Math.sqrt(vx * vx + vy * vy + vz * vz);
          magnitudes.push(magnitude);
          positions.push(x, y, z);
          maxMagnitude = Math.max(maxMagnitude, magnitude);
        }
      }
    }

    // Second pass: assign colors based on normalized magnitude
    for (const mag of magnitudes) {
      const normalized = maxMagnitude > 0 ? mag / maxMagnitude : 0;

      // Color gradient: blue (low) -> cyan -> green -> yellow -> red (high)
      const color = new THREE.Color();
      if (normalized < 0.25) {
        color.setHSL(0.6, 1.0, 0.3 + normalized * 0.8); // Blue to cyan
      } else if (normalized < 0.5) {
        color.setHSL(0.5 - (normalized - 0.25) * 0.8, 1.0, 0.5); // Cyan to green
      } else if (normalized < 0.75) {
        color.setHSL(0.3 - (normalized - 0.5) * 0.6, 1.0, 0.5); // Green to yellow
      } else {
        color.setHSL(0.1 - (normalized - 0.75) * 0.4, 1.0, 0.5); // Yellow to red
      }

      colors.push(color.r, color.g, color.b);
    }

    return {
      positions,
      colors,
      count: positions.length / 3,
    };
  }, [fx, fy, fz, range, resolution]);

  useEffect(() => {
    if (!meshRef.current) return;

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      matrix.setPosition(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );
      meshRef.current.setMatrixAt(i, matrix);

      color.setRGB(
        colors[i * 3],
        colors[i * 3 + 1],
        colors[i * 3 + 2]
      );
      meshRef.current.setColorAt(i, color);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [positions, colors, count]);

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshStandardMaterial
        transparent
        opacity={0.6}
        vertexColors
      />
    </instancedMesh>
  );
}

export function VectorField3D() {
  const [fx, setFx] = useState("-y");
  const [fy, setFy] = useState("x");
  const [fz, setFz] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(true);
  const [animationSpeed, setAnimationSpeed] = useState(1.0);
  const [showArrows, setShowArrows] = useState(true);
  const [showParticles, setShowParticles] = useState(true);
  const [showVolumetric, setShowVolumetric] = useState(false);
  const [gridSize, setGridSize] = useState(5);
  const [volumetricResolution, setVolumetricResolution] = useState(12);

  const handlePreset = (preset: VectorFieldPreset3D) => {
    setFx(preset.fx);
    setFy(preset.fy);
    setFz(preset.fz);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-center">3D Vector Field Visualizer</h1>
        <p className="text-gray-400 text-center mb-8">
          Define a 3D vector field F(x,y,z) = (Fx, Fy, Fz) and visualize the flow
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="space-y-6">
            {/* Input Section */}
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Vector Field Components</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">
                    Fx(x, y, z)
                  </label>
                  <input
                    type="text"
                    value={fx}
                    onChange={(e) => setFx(e.target.value)}
                    className="w-full bg-[#242424] border border-gray-700 rounded px-4 py-2 font-mono text-sm focus:outline-none focus:border-blue-500"
                    placeholder="e.g., -y"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">
                    Fy(x, y, z)
                  </label>
                  <input
                    type="text"
                    value={fy}
                    onChange={(e) => setFy(e.target.value)}
                    className="w-full bg-[#242424] border border-gray-700 rounded px-4 py-2 font-mono text-sm focus:outline-none focus:border-blue-500"
                    placeholder="e.g., x"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">
                    Fz(x, y, z)
                  </label>
                  <input
                    type="text"
                    value={fz}
                    onChange={(e) => setFz(e.target.value)}
                    className="w-full bg-[#242424] border border-gray-700 rounded px-4 py-2 font-mono text-sm focus:outline-none focus:border-blue-500"
                    placeholder="e.g., 0"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-500 rounded px-4 py-2 text-sm text-red-200 mt-4">
                  {error}
                </div>
              )}

              <div className="mt-4 p-3 bg-[#242424] rounded text-sm">
                <p className="text-gray-400 mb-1">Current field:</p>
                <p className="font-mono">
                  <span className="text-blue-400">F(x,y,z)</span> = ({fx}, {fy}, {fz})
                </p>
              </div>
            </div>

            {/* Presets */}
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-3">Presets</h3>
              <div className="space-y-2">
                {presets3D.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePreset(preset)}
                    className="w-full bg-[#242424] hover:bg-[#2a2a2a] border border-gray-700 rounded p-3 text-left transition-colors"
                  >
                    <div className="font-medium text-sm">{preset.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{preset.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Animation Controls */}
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Controls</h3>
              <div className="space-y-4">
                <button
                  onClick={() => setIsAnimating(!isAnimating)}
                  className="w-full bg-[#242424] hover:bg-[#2a2a2a] border border-gray-700 rounded px-4 py-2 text-sm font-medium transition-colors"
                >
                  {isAnimating ? "⏸ Pause" : "▶ Play"}
                </button>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Speed: {animationSpeed.toFixed(1)}x
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="3.0"
                    step="0.1"
                    value={animationSpeed}
                    onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Arrow Grid: {gridSize}×{gridSize}×{gridSize}
                  </label>
                  <input
                    type="range"
                    min="3"
                    max="8"
                    step="1"
                    value={gridSize}
                    onChange={(e) => setGridSize(parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowArrows(!showArrows)}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded border transition-colors ${
                      showArrows
                        ? "bg-[#242424] border-gray-700 hover:bg-[#2a2a2a]"
                        : "bg-gray-700/30 border-gray-600 text-gray-500"
                    }`}
                  >
                    {showArrows ? "◉ Arrows" : "○ Arrows"}
                  </button>
                  <button
                    onClick={() => setShowParticles(!showParticles)}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded border transition-colors ${
                      showParticles
                        ? "bg-[#242424] border-gray-700 hover:bg-[#2a2a2a]"
                        : "bg-gray-700/30 border-gray-600 text-gray-500"
                    }`}
                  >
                    {showParticles ? "◉ Particles" : "○ Particles"}
                  </button>
                </div>

                <button
                  onClick={() => setShowVolumetric(!showVolumetric)}
                  className={`w-full px-4 py-2 text-sm font-medium rounded border transition-colors ${
                    showVolumetric
                      ? "bg-purple-500/20 border-purple-500 text-purple-300"
                      : "bg-[#242424] border-gray-700 hover:bg-[#2a2a2a]"
                  }`}
                >
                  {showVolumetric ? "◉ Volumetric Field" : "○ Volumetric Field"}
                </button>

                {showVolumetric && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Resolution: {volumetricResolution}³ ({Math.pow(volumetricResolution + 1, 3).toLocaleString()} points)
                    </label>
                    <input
                      type="range"
                      min="8"
                      max="20"
                      step="2"
                      value={volumetricResolution}
                      onChange={(e) => setVolumetricResolution(parseInt(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Higher = more detailed but slower
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - 3D Canvas */}
          <div className="lg:col-span-2">
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <div className="aspect-square w-full rounded-lg overflow-hidden border border-gray-700">
                <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
                  <color attach="background" args={["#0a0a0a"]} />
                  <ambientLight intensity={0.5} />
                  <pointLight position={[10, 10, 10]} intensity={0.8} />
                  <pointLight position={[-10, -10, -10]} intensity={0.3} />

                  {/* Grid */}
                  <Grid
                    args={[20, 20]}
                    cellSize={0.5}
                    cellThickness={0.5}
                    cellColor="#444444"
                    sectionSize={2}
                    sectionThickness={1}
                    sectionColor="#666666"
                    fadeDistance={30}
                    fadeStrength={1}
                    followCamera={false}
                  />

                  {/* Vector Field Arrows */}
                  {showArrows && (
                    <VectorArrows
                      fx={fx}
                      fy={fy}
                      fz={fz}
                      gridSize={gridSize}
                      range={2}
                    />
                  )}

                  {/* Particle System */}
                  {showParticles && (
                    <ParticleSystem
                      fx={fx}
                      fy={fy}
                      fz={fz}
                      range={2}
                      count={300}
                      isAnimating={isAnimating}
                      speed={animationSpeed}
                    />
                  )}

                  {/* Volumetric Field */}
                  {showVolumetric && (
                    <VolumetricField
                      fx={fx}
                      fy={fy}
                      fz={fz}
                      range={2}
                      resolution={volumetricResolution}
                    />
                  )}

                  <OrbitControls makeDefault />

                  <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                    <GizmoViewport
                      axisColors={["#ff4444", "#44ff44", "#4444ff"]}
                      labelColor="white"
                    />
                  </GizmoHelper>
                </Canvas>
              </div>

              <div className="mt-4 text-center text-sm text-gray-400">
                <p>Use mouse to rotate • Scroll to zoom • Right-click to pan</p>
                <p className="mt-1">
                  <span className="text-red-400">Red: X</span> •
                  <span className="text-green-400"> Green: Y</span> •
                  <span className="text-blue-400"> Blue: Z</span>
                </p>
                {showVolumetric && (
                  <p className="mt-2 text-purple-400">
                    Volumetric: Blue (low) → Cyan → Green → Yellow → Red (high magnitude)
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VectorField3D;

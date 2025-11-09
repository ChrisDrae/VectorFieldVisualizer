import { useEffect, useRef, useState } from "react";
import "./index.css";

// Color theme definitions
type ColorTheme = 'viridis' | 'plasma' | 'cool' | 'hot' | 'rainbow' | 'grayscale';

const colorMaps: Record<ColorTheme, number[][]> = {
  viridis: [
    [68, 1, 84],
    [72, 40, 120],
    [62, 73, 137],
    [49, 104, 142],
    [38, 130, 142],
    [31, 158, 137],
    [53, 183, 121],
    [110, 206, 88],
    [181, 222, 43],
    [253, 231, 37],
  ],
  plasma: [
    [13, 8, 135],
    [75, 3, 161],
    [125, 3, 168],
    [168, 34, 150],
    [203, 70, 121],
    [229, 107, 93],
    [248, 148, 65],
    [253, 195, 40],
    [240, 249, 33],
  ],
  cool: [
    [0, 255, 255],
    [51, 204, 255],
    [102, 153, 255],
    [153, 102, 255],
    [204, 51, 255],
    [255, 0, 255],
  ],
  hot: [
    [0, 0, 0],
    [128, 0, 0],
    [255, 0, 0],
    [255, 128, 0],
    [255, 255, 0],
    [255, 255, 128],
    [255, 255, 255],
  ],
  rainbow: [
    [148, 0, 211],
    [75, 0, 130],
    [0, 0, 255],
    [0, 255, 0],
    [255, 255, 0],
    [255, 127, 0],
    [255, 0, 0],
  ],
  grayscale: [
    [0, 0, 0],
    [64, 64, 64],
    [128, 128, 128],
    [192, 192, 192],
    [255, 255, 255],
  ],
};

function getColor(t: number, theme: ColorTheme): string {
  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t));

  const colors = colorMaps[theme];

  // Interpolate through the colormap
  const scaled = t * (colors.length - 1);
  const idx = Math.floor(scaled);
  const frac = scaled - idx;

  if (idx >= colors.length - 1) {
    const c = colors[colors.length - 1];
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  const c1 = colors[idx];
  const c2 = colors[idx + 1];

  const r = Math.round(c1[0] + (c2[0] - c1[0]) * frac);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * frac);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * frac);

  return `rgb(${r}, ${g}, ${b})`;
}

// Safe expression evaluator
function createFieldFunction(expression: string): (x: number, y: number) => number {
  try {
    // Allow common math functions and variables
    const func = new Function('x', 'y', 'Math', `
      'use strict';
      return ${expression};
    `);

    return (x: number, y: number) => {
      try {
        const result = func(x, y, Math);
        return typeof result === 'number' && isFinite(result) ? result : 0;
      } catch {
        return 0;
      }
    };
  } catch {
    return () => 0;
  }
}

// Numerical derivative using central difference
function derivative(f: (x: number, y: number) => number, x: number, y: number, axis: 'x' | 'y'): number {
  const h = 0.01;
  if (axis === 'x') {
    return (f(x + h, y) - f(x - h, y)) / (2 * h);
  } else {
    return (f(x, y + h) - f(x, y - h)) / (2 * h);
  }
}

interface VectorFieldPreset {
  name: string;
  fx: string;
  fy: string;
  description: string;
}

const presets: VectorFieldPreset[] = [
  { name: "Rotational", fx: "-y", fy: "x", description: "Counter-clockwise rotation (zero divergence)" },
  { name: "Radial Outward", fx: "x", fy: "y", description: "Expanding from origin (positive divergence)" },
  { name: "Radial Inward", fx: "-x", fy: "-y", description: "Contracting to origin (negative divergence)" },
  { name: "Saddle", fx: "x", fy: "-y", description: "Hyperbolic flow (zero divergence)" },
  { name: "Shear", fx: "y", fy: "0", description: "Horizontal shear flow" },
  { name: "Spiral", fx: "-y + 0.1*x", fy: "x + 0.1*y", description: "Outward spiral" },
  { name: "Wave", fx: "Math.sin(y)", fy: "Math.cos(x)", description: "Sinusoidal field" },
];

interface Particle {
  x: number;
  y: number;
  life: number;
}

interface PointSource {
  id: number;
  x: number;
  y: number;
  strength: number; // positive = source, negative = sink
  type: 'source' | 'sink';
}

type InteractionMode = 'none' | 'add-source' | 'add-sink' | 'drag';

interface PhysicsPreset {
  name: string;
  description: string;
  fx: string;
  fy: string;
  sources: Omit<PointSource, 'id'>[];
}

const physicsPresets: PhysicsPreset[] = [
  {
    name: "Electric Dipole",
    description: "Positive and negative charges",
    fx: "0",
    fy: "0",
    sources: [
      { x: -1, y: 0, strength: 3, type: 'source' },
      { x: 1, y: 0, strength: -3, type: 'sink' },
    ],
  },
  {
    name: "Earth-Moon System",
    description: "Gravitational field",
    fx: "0",
    fy: "0",
    sources: [
      { x: -0.5, y: 0, strength: -4, type: 'sink' }, // Earth (larger mass)
      { x: 1.5, y: 0, strength: -1, type: 'sink' }, // Moon (smaller mass)
    ],
  },
  {
    name: "Quadrupole",
    description: "Four alternating charges",
    fx: "0",
    fy: "0",
    sources: [
      { x: -1, y: -1, strength: 2, type: 'source' },
      { x: 1, y: -1, strength: -2, type: 'sink' },
      { x: 1, y: 1, strength: 2, type: 'source' },
      { x: -1, y: 1, strength: -2, type: 'sink' },
    ],
  },
  {
    name: "Binary Star",
    description: "Two equal mass objects orbiting",
    fx: "0",
    fy: "0",
    sources: [
      { x: -1.2, y: 0, strength: -3, type: 'sink' },
      { x: 1.2, y: 0, strength: -3, type: 'sink' },
    ],
  },
];

export function VectorField2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fx, setFx] = useState("-y");
  const [fy, setFy] = useState("x");
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(true);
  const [animationSpeed, setAnimationSpeed] = useState(1.0);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [pointSources, setPointSources] = useState<PointSource[]>([]);
  const [colorTheme, setColorTheme] = useState<ColorTheme>('viridis');
  const [isPulsingEnabled, setIsPulsingEnabled] = useState(true);
  const [draggedSourceId, setDraggedSourceId] = useState<number | null>(null);

  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();
  const nextSourceIdRef = useRef(0);
  const fpsRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const size = 600;
    canvas.width = size;
    canvas.height = size;

    // Setup coordinate system
    const gridSize = 100; // Fine grid for smooth divergence gradient
    const arrowGridSize = 20; // Coarser grid for arrows to maintain performance
    const range = 3;
    const step = (2 * range) / gridSize;
    const arrowStep = (2 * range) / arrowGridSize;

    // Create field functions
    let Fx: (x: number, y: number) => number;
    let Fy: (x: number, y: number) => number;
    let divergenceGrid: number[][] = [];
    let minDiv = 0;
    let maxDiv = 0;

    try {
      const baseFx = createFieldFunction(fx);
      const baseFy = createFieldFunction(fy);

      // Create combined field with point sources/sinks
      Fx = (x: number, y: number) => {
        let fx = baseFx(x, y);
        for (const ps of pointSources) {
          const dx = x - ps.x;
          const dy = y - ps.y;
          const rSq = dx * dx + dy * dy + 0.01; // avoid singularity
          fx += ps.strength * dx / rSq;
        }
        return fx;
      };

      Fy = (x: number, y: number) => {
        let fy = baseFy(x, y);
        for (const ps of pointSources) {
          const dx = x - ps.x;
          const dy = y - ps.y;
          const rSq = dx * dx + dy * dy + 0.01; // avoid singularity
          fy += ps.strength * dy / rSq;
        }
        return fy;
      };

      // Calculate divergence for all points
      minDiv = Infinity;
      maxDiv = -Infinity;

      for (let i = 0; i <= gridSize; i++) {
        divergenceGrid[i] = [];
        for (let j = 0; j <= gridSize; j++) {
          const x = -range + i * step;
          const y = range - j * step;

          const dFx_dx = derivative(Fx, x, y, 'x');
          const dFy_dy = derivative(Fy, x, y, 'y');
          const div = dFx_dx + dFy_dy;

          divergenceGrid[i][j] = div;
          if (isFinite(div)) {
            minDiv = Math.min(minDiv, div);
            maxDiv = Math.max(maxDiv, div);
          }
        }
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error rendering field');
      return;
    }

    // Initialize particles
    if (particlesRef.current.length === 0) {
      const numParticles = 500;
      for (let i = 0; i < numParticles; i++) {
        particlesRef.current.push({
          x: (Math.random() * 2 - 1) * range,
          y: (Math.random() * 2 - 1) * range,
          life: Math.random(),
        });
      }
    }

    let startTime = Date.now();

    const animate = () => {
      const currentTime = Date.now();

      // Calculate FPS
      const deltaTime = currentTime - lastFrameTimeRef.current;
      if (deltaTime > 0) {
        fpsRef.current = Math.round(1000 / deltaTime);
      }
      lastFrameTimeRef.current = currentTime;

      const elapsed = (currentTime - startTime) / 1000; // seconds

      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, size, size);

      // Draw pulsating divergence background
      const cellSize = size / gridSize;
      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const div = divergenceGrid[i][j];

          if (isFinite(div)) {
            const normalized = maxDiv === minDiv ? 0.5 :
              (div - minDiv) / (maxDiv - minDiv);

            let alpha = 0.5; // Base alpha

            if (isPulsingEnabled && isAnimating) {
              // Subtle pulsating effect based on divergence magnitude (only when animating)
              const divMagnitude = Math.abs(div);
              const pulseFreq = 0.5 + divMagnitude * 0.5; // Gentler frequency variation
              const pulseIntensity = 0.05 + 0.1 * Math.abs(normalized - 0.5); // Reduced intensity
              const pulse = Math.sin(elapsed * pulseFreq * Math.PI) * pulseIntensity;

              alpha = 0.5 + pulse * 0.15; // Subtle alpha variation
            }

            ctx.fillStyle = getColor(normalized, colorTheme);
            ctx.globalAlpha = Math.max(0.35, Math.min(0.65, alpha));
            ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
          }
        }
      }
      ctx.globalAlpha = 1.0;

      // Draw coordinate axes
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.stroke();

      // Draw grid lines
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= arrowGridSize; i++) {
        const pos = (i / arrowGridSize) * size;
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(size, pos);
        ctx.stroke();
      }

      // Update and draw particles only when animating
      if (isAnimating) {
        const dt = 0.016 * animationSpeed; // ~60fps base timestep

        for (const particle of particlesRef.current) {
          // Get vector at particle position
          const vx = Fx(particle.x, particle.y);
          const vy = Fy(particle.x, particle.y);

          if (isFinite(vx) && isFinite(vy)) {
            // Update particle position (Euler integration)
            particle.x += vx * dt;
            particle.y += vy * dt;
          }

          // Decrease particle life
          particle.life -= 0.005 * animationSpeed;

          // Respawn particle if it dies or goes out of bounds
          if (particle.life <= 0 || Math.abs(particle.x) > range || Math.abs(particle.y) > range) {
            particle.x = (Math.random() * 2 - 1) * range;
            particle.y = (Math.random() * 2 - 1) * range;
            particle.life = 1;
          }

          // Draw particle as arrow
          const canvasX = ((particle.x + range) / (2 * range)) * size;
          const canvasY = ((range - particle.y) / (2 * range)) * size;

          const magnitude = Math.sqrt(vx * vx + vy * vy);
          const alpha = particle.life * Math.min(1, magnitude * 0.3 + 0.5);

          if (magnitude > 0.01) {
            // Calculate arrow dimensions based on magnitude
            const arrowScale = 8;
            const arrowLength = Math.min(magnitude * arrowScale, 15);

            const dirX = vx / magnitude;
            const dirY = -vy / magnitude; // flip y for canvas

            const endX = canvasX + dirX * arrowLength;
            const endY = canvasY + dirY * arrowLength;

            // Draw arrow shaft
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 1.5;

            ctx.beginPath();
            ctx.moveTo(canvasX, canvasY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Draw arrowhead
            const headSize = 3;
            const angle = Math.atan2(dirY, dirX);

            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(
              endX - headSize * Math.cos(angle - Math.PI / 6),
              endY - headSize * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
              endX - headSize * Math.cos(angle + Math.PI / 6),
              endY - headSize * Math.sin(angle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Draw static arrow grid (more prominent when paused)
      for (let i = 0; i < arrowGridSize; i++) {
        for (let j = 0; j < arrowGridSize; j++) {
          const x = -range + i * arrowStep + arrowStep / 2;
          const y = range - j * arrowStep - arrowStep / 2;

          const vx = Fx(x, y);
          const vy = Fy(x, y);

          if (!isFinite(vx) || !isFinite(vy)) continue;

          const magnitude = Math.sqrt(vx * vx + vy * vy);
          const canvasX = ((x + range) / (2 * range)) * size;
          const canvasY = ((range - y) / (2 * range)) * size;

          const scale = 15;
          const arrowLength = magnitude * scale;
          if (arrowLength < 0.5) continue;

          const dirX = vx / (magnitude || 1);
          const dirY = -vy / (magnitude || 1);

          const endX = canvasX + dirX * arrowLength;
          const endY = canvasY + dirY * arrowLength;

          // More visible when paused, faded when animating with particles
          const baseAlpha = isAnimating ?
            Math.min(1, magnitude * 0.3 + 0.2) * 0.3 : // Faded when animating
            Math.min(1, magnitude * 0.5 + 0.4); // Full opacity when paused

          ctx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha})`;
          ctx.fillStyle = `rgba(255, 255, 255, ${baseAlpha})`;
          ctx.lineWidth = isAnimating ? 1 : 1.5;

          ctx.beginPath();
          ctx.moveTo(canvasX, canvasY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          const arrowHeadSize = isAnimating ? 4 : 5;
          const angle = Math.atan2(dirY, dirX);

          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - arrowHeadSize * Math.cos(angle - Math.PI / 6),
            endY - arrowHeadSize * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            endX - arrowHeadSize * Math.cos(angle + Math.PI / 6),
            endY - arrowHeadSize * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        }
      }

      // Draw point sources/sinks
      for (const ps of pointSources) {
        const canvasX = ((ps.x + range) / (2 * range)) * size;
        const canvasY = ((range - ps.y) / (2 * range)) * size;

        // Draw outer circle with glow
        const radius = 12;
        const color = ps.type === 'source' ? '#ff6b6b' : '#4dabf7';

        ctx.shadowBlur = 15;
        ctx.shadowColor = color;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Draw symbol
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        if (ps.type === 'source') {
          // Draw + symbol
          ctx.beginPath();
          ctx.moveTo(canvasX - 5, canvasY);
          ctx.lineTo(canvasX + 5, canvasY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(canvasX, canvasY - 5);
          ctx.lineTo(canvasX, canvasY + 5);
          ctx.stroke();
        } else {
          // Draw - symbol
          ctx.beginPath();
          ctx.moveTo(canvasX - 5, canvasY);
          ctx.lineTo(canvasX + 5, canvasY);
          ctx.stroke();
        }
      }

      // Draw coordinate labels
      ctx.fillStyle = '#999';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${range}`, size - 15, size / 2 - 5);
      ctx.fillText(`${-range}`, 15, size / 2 - 5);
      ctx.fillText(`${range}`, size / 2 + 15, 15);
      ctx.fillText(`${-range}`, size / 2 + 15, size - 5);

      // Draw divergence scale
      const scaleWidth = 200;
      const scaleHeight = 20;
      const scaleX = size - scaleWidth - 20;
      const scaleY = 20;

      for (let i = 0; i < scaleWidth; i++) {
        ctx.fillStyle = getColor(i / scaleWidth, colorTheme);
        ctx.fillRect(scaleX + i, scaleY, 1, scaleHeight);
      }

      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.strokeRect(scaleX, scaleY, scaleWidth, scaleHeight);

      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`div: ${minDiv.toFixed(2)}`, scaleX, scaleY + scaleHeight + 15);
      ctx.textAlign = 'right';
      ctx.fillText(`${maxDiv.toFixed(2)}`, scaleX + scaleWidth, scaleY + scaleHeight + 15);

      // Draw FPS counter
      ctx.fillStyle = '#00ff00';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'left';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#000';
      ctx.fillText(`FPS: ${fpsRef.current}`, 10, 25);
      ctx.shadowBlur = 0;

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [fx, fy, isAnimating, animationSpeed, pointSources, colorTheme, isPulsingEnabled]);

  const handlePreset = (preset: VectorFieldPreset) => {
    setFx(preset.fx);
    setFy(preset.fy);
  };

  const canvasToFieldCoords = (canvasX: number, canvasY: number) => {
    const size = 600;
    const range = 3;
    const fieldX = ((canvasX / size) * (2 * range)) - range;
    const fieldY = range - ((canvasY / size) * (2 * range));
    return { x: fieldX, y: fieldY };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const { x: fieldX, y: fieldY } = canvasToFieldCoords(clickX, clickY);

    if (interactionMode === 'drag') {
      // Find if we clicked on a source/sink
      for (const ps of pointSources) {
        const dx = ps.x - fieldX;
        const dy = ps.y - fieldY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.3) { // Click radius in field coordinates
          setDraggedSourceId(ps.id);
          return;
        }
      }
    } else if (interactionMode === 'add-source') {
      setPointSources([...pointSources, {
        id: nextSourceIdRef.current++,
        x: fieldX,
        y: fieldY,
        strength: 2.0,
        type: 'source',
      }]);
      setInteractionMode('none');
    } else if (interactionMode === 'add-sink') {
      setPointSources([...pointSources, {
        id: nextSourceIdRef.current++,
        x: fieldX,
        y: fieldY,
        strength: -2.0,
        type: 'sink',
      }]);
      setInteractionMode('none');
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedSourceId === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const moveX = e.clientX - rect.left;
    const moveY = e.clientY - rect.top;
    const { x: fieldX, y: fieldY } = canvasToFieldCoords(moveX, moveY);

    setPointSources(pointSources.map(ps =>
      ps.id === draggedSourceId ? { ...ps, x: fieldX, y: fieldY } : ps
    ));
  };

  const handleCanvasMouseUp = () => {
    setDraggedSourceId(null);
  };

  const removePointSource = (id: number) => {
    setPointSources(pointSources.filter(ps => ps.id !== id));
  };

  const clearPointSources = () => {
    setPointSources([]);
  };

  const loadPhysicsPreset = (preset: PhysicsPreset) => {
    setFx(preset.fx);
    setFy(preset.fy);
    const newSources = preset.sources.map(s => ({
      ...s,
      id: nextSourceIdRef.current++,
    }));
    setPointSources(newSources);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-center">2D Vector Field Visualizer</h1>
        <p className="text-gray-400 text-center mb-8">
          Define a 2D vector field F(x,y) = (Fx, Fy) and visualize its divergence
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
                    Fx(x, y)
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
                    Fy(x, y)
                  </label>
                  <input
                    type="text"
                    value={fy}
                    onChange={(e) => setFy(e.target.value)}
                    className="w-full bg-[#242424] border border-gray-700 rounded px-4 py-2 font-mono text-sm focus:outline-none focus:border-blue-500"
                    placeholder="e.g., x"
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
                  <span className="text-blue-400">F(x,y)</span> = ({fx}, {fy})
                </p>
                <p className="font-mono text-gray-400 mt-1">
                  <span className="text-green-400">div F</span> = ∂Fx/∂x + ∂Fy/∂y
                </p>
              </div>
            </div>

            {/* Animation Controls */}
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Animation Controls</h3>
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
                    Color Theme
                  </label>
                  <select
                    value={colorTheme}
                    onChange={(e) => setColorTheme(e.target.value as ColorTheme)}
                    className="w-full bg-[#242424] border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="viridis">Viridis (Scientific)</option>
                    <option value="plasma">Plasma (Scientific)</option>
                    <option value="cool">Cool (Cyan-Magenta)</option>
                    <option value="hot">Hot (Black-Red-Yellow)</option>
                    <option value="rainbow">Rainbow (Spectrum)</option>
                    <option value="grayscale">Grayscale</option>
                  </select>
                </div>

                <button
                  onClick={() => setIsPulsingEnabled(!isPulsingEnabled)}
                  className={`w-full px-4 py-2 text-sm font-medium rounded border transition-colors ${
                    isPulsingEnabled
                      ? "bg-[#242424] border-gray-700 hover:bg-[#2a2a2a]"
                      : "bg-gray-700/30 border-gray-600 text-gray-500"
                  }`}
                >
                  {isPulsingEnabled ? "◉ Pulsing On" : "○ Pulsing Off"}
                </button>
              </div>
            </div>

            {/* Interactive Sources/Sinks */}
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-3">Interactive Modification</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setInteractionMode(interactionMode === 'add-source' ? 'none' : 'add-source')}
                  className={`w-full px-4 py-2 text-sm font-medium rounded border transition-colors ${
                    interactionMode === 'add-source'
                      ? 'bg-red-500/20 border-red-500 text-red-300'
                      : 'bg-[#242424] border-gray-700 hover:bg-[#2a2a2a]'
                  }`}
                >
                  + Add Source
                </button>
                <button
                  onClick={() => setInteractionMode(interactionMode === 'add-sink' ? 'none' : 'add-sink')}
                  className={`w-full px-4 py-2 text-sm font-medium rounded border transition-colors ${
                    interactionMode === 'add-sink'
                      ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                      : 'bg-[#242424] border-gray-700 hover:bg-[#2a2a2a]'
                  }`}
                >
                  - Add Sink
                </button>
                <button
                  onClick={() => setInteractionMode(interactionMode === 'drag' ? 'none' : 'drag')}
                  className={`w-full px-4 py-2 text-sm font-medium rounded border transition-colors ${
                    interactionMode === 'drag'
                      ? 'bg-green-500/20 border-green-500 text-green-300'
                      : 'bg-[#242424] border-gray-700 hover:bg-[#2a2a2a]'
                  }`}
                >
                  ⇄ Drag Mode
                </button>
                {pointSources.length > 0 && (
                  <button
                    onClick={clearPointSources}
                    className="w-full px-4 py-2 text-sm font-medium rounded border border-gray-700 bg-[#242424] hover:bg-[#2a2a2a] transition-colors"
                  >
                    Clear All ({pointSources.length})
                  </button>
                )}
              </div>

              {interactionMode !== 'none' && interactionMode !== 'drag' && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded text-sm text-blue-200 mt-3">
                  Click canvas to place {interactionMode === 'add-source' ? 'source' : 'sink'}
                </div>
              )}
              {interactionMode === 'drag' && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded text-sm text-green-200 mt-3">
                  Click and drag to move
                </div>
              )}

              {pointSources.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-gray-400 mb-2">Placed elements:</p>
                  <div className="space-y-1">
                    {pointSources.map((ps) => (
                      <div
                        key={ps.id}
                        className="flex items-center justify-between px-3 py-2 bg-[#242424] border border-gray-700 rounded text-sm"
                      >
                        <div>
                          <span className={ps.type === 'source' ? 'text-red-400' : 'text-blue-400'}>
                            {ps.type === 'source' ? '+ Source' : '- Sink'}
                          </span>
                          <span className="text-gray-500 ml-2">
                            ({ps.x.toFixed(1)}, {ps.y.toFixed(1)})
                          </span>
                        </div>
                        <button
                          onClick={() => removePointSource(ps.id)}
                          className="text-gray-400 hover:text-red-400"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Vector Field Presets */}
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-3">Vector Field Presets</h3>
              <div className="space-y-2">
                {presets.map((preset) => (
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

            {/* Physics Presets */}
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-3">Physics Presets</h3>
              <div className="space-y-2">
                {physicsPresets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => loadPhysicsPreset(preset)}
                    className="w-full bg-[#242424] hover:bg-[#2a2a2a] border border-gray-700 rounded p-3 text-left transition-colors"
                  >
                    <div className="font-medium text-sm">{preset.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{preset.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel - Canvas */}
          <div className="lg:col-span-2">
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <div className="flex justify-center">
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  className={`border border-gray-700 rounded-lg shadow-2xl ${
                    interactionMode === 'drag' ? 'cursor-move' :
                    interactionMode !== 'none' ? 'cursor-crosshair' : 'cursor-default'
                  }`}
                />
              </div>

              {/* Legend */}
              <div className="mt-4 text-center text-sm text-gray-400">
                <p>When animating: Flowing particles trace streamlines • Static arrows faded</p>
                <p>When paused: Static arrow field displayed • No particle flow</p>
                <p className="mt-2">
                  <span className="text-red-400">Red (+)</span> = sources •
                  <span className="text-blue-400"> Blue (-)</span> = sinks •
                  Background = divergence gradient
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VectorField2D;

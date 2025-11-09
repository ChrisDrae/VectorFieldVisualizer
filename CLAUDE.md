# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `bun dev` - Start development server with hot reloading (runs `src/index.tsx`)
- `bun start` - Run production server (sets NODE_ENV=production)
- `bun run build` - Build for production using `build.ts`
- `bun install` - Install dependencies

The build script (`build.ts`) supports CLI arguments:
- `--outdir <path>` - Output directory (default: "dist")
- `--minify` - Enable minification
- `--sourcemap <type>` - Sourcemap type (none|linked|inline|external)
- `--external <list>` - External packages (comma separated)
- Run `bun run build.ts --help` for all options

## Project Overview

This is a **Vector Field Visualizer** - an interactive web application for visualizing 2D vector fields and their divergence properties. Built with Bun + React + Tailwind CSS.

### Key Features
- Real-time vector field visualization with customizable mathematical expressions
- Divergence calculation and gradient visualization with multiple color schemes
- Interactive point sources/sinks (add, drag, remove)
- Physics presets (Electric Dipole, Earth-Moon System, Quadrupole, Binary Star)
- Vector field presets (Rotational, Radial, Saddle, Shear, Spiral, Wave)
- Particle-based flow visualization with adjustable animation speed
- Pulsating divergence background effect
- FPS monitoring

## Project Architecture

This is a Bun + React + Tailwind application with the following structure:

### Server-Side (`src/index.tsx`)
- Uses `Bun.serve()` with routes-based routing
- All routes serve `src/index.html` (SPA behavior via `"/*": index`)
- API routes defined inline with HTTP method handlers (GET, PUT, etc.)
- Route parameters accessed via `req.params` (e.g., `/api/hello/:name`)
- Development mode enables HMR and console echoing when NODE_ENV !== "production"

### Frontend
- Entry point: `src/index.html` imports `src/frontend.tsx`
- React app rendered to `#root` element
- Main component: `src/App.tsx`
- Tailwind CSS configured via `@import "tailwindcss"` in `src/index.css`
- Uses `bun-plugin-tailwind` for Tailwind processing (configured in `bunfig.toml`)
- SVG assets imported directly in components

### Key Files
- `src/index.tsx` - Server setup with routes and API endpoints
- `src/frontend.tsx` - React app initialization and DOM mounting
- `src/App.tsx` - Vector Field Visualizer main component with canvas rendering, field calculations, and UI controls
- `src/APITester.tsx` - API endpoint testing component (utility component, not currently used in main app)
- `src/index.html` - HTML entry point
- `src/index.css` - Global styles with Tailwind layers and custom animations
- `build.ts` - Custom production build script with CLI argument parsing

### Styling
- Uses Tailwind CSS v4 with `@layer base` for global styles
- Tailwind imported via CSS (`@import "tailwindcss"`)
- Custom animations defined in `index.css`
- Dark theme optimized for visualization (bg-[#0a0a0a] main, bg-[#1a1a1a] panels, bg-[#242424] inputs)
- Scientific color schemes for divergence visualization: Viridis, Plasma, Cool, Hot, Rainbow, Grayscale
- Interactive canvas rendering with HTML5 Canvas API

## Application-Specific Details

### Vector Field Mathematics
- Field functions created using `new Function()` for safe expression evaluation
- Numerical derivatives calculated using central difference method (h = 0.01)
- Divergence computed as: div F = ∂Fx/∂x + ∂Fy/∂y
- Point sources/sinks use inverse-square law: strength × (x,y) / r²

### Canvas Rendering
- 600×600 canvas with coordinate range [-3, 3] on both axes
- Fine grid (100×100) for smooth divergence gradient calculation
- Coarse grid (20×20) for arrow field to maintain performance
- Particle system with 500 particles for flow visualization
- Animation frame rate monitoring with FPS display

### State Management
- React useState and useRef hooks for local state
- useEffect for canvas rendering and animation loop
- Particle positions updated using Euler integration
- Animation controlled via requestAnimationFrame

### User Interactions
- Text input for custom mathematical expressions (supports Math.* functions)
- Click-to-add point sources/sinks
- Drag mode for repositioning sources/sinks
- Preset selection for common field configurations
- Real-time parameter adjustments (speed, color theme, pulsing effect)

## Bun-Specific Conventions

- Use `bun` command instead of `node` or `npm`
- Use `Bun.serve()` for HTTP servers (not express)
- HTML files can import .tsx/.jsx files directly
- Bun's bundler handles TypeScript, React, and CSS automatically
- Use `--hot` flag for hot reloading during development
- Prefer `Bun.file` over `node:fs` for file operations
- Bun automatically loads .env files (no dotenv package needed)

## TypeScript Configuration

- Strict mode enabled with best practices
- Path alias: `@/*` maps to `./src/*`
- Module resolution: "bundler" mode
- Target: ESNext with Preserve modules
- React JSX transform enabled

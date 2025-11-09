import { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { NavigationDrawer } from "./NavigationDrawer";
import { VectorField2D } from "./VectorField2D";
import { VectorField3D } from "./VectorField3D";
import "./index.css";

export function App() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <Router>
      <div className="min-h-screen bg-[#0a0a0a]">
        {/* Hamburger Menu Button */}
        <button
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          className="fixed top-4 left-4 z-30 bg-[#1a1a1a] hover:bg-[#242424] border border-gray-700 rounded-lg p-3 transition-colors shadow-lg"
          aria-label="Toggle navigation"
        >
          <div className="w-6 h-5 flex flex-col justify-between">
            <span className="block w-full h-0.5 bg-white rounded"></span>
            <span className="block w-full h-0.5 bg-white rounded"></span>
            <span className="block w-full h-0.5 bg-white rounded"></span>
          </div>
        </button>

        {/* Navigation Drawer */}
        <NavigationDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
        />

        {/* Main Content */}
        <Routes>
          <Route path="/" element={<VectorField2D />} />
          <Route path="/3d" element={<VectorField3D />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

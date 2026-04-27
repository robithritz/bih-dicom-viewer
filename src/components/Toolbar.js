export default function Toolbar({
  currentTool,
  onToolChange,
  onClearMeasurements,
  onRotate,
  onReset,
  onToggleFileBrowser,
  currentFrame,
  totalFrames
}) {
  const tools = [
    { id: 'wwwc', label: 'W/L', title: 'Window/Level' },
    { id: 'zoom', label: 'Zoom', title: 'Zoom' },
    { id: 'pan', label: 'Pan', title: 'Pan' },
    { id: 'length', label: 'Length', title: 'Length Measurement' },
    { id: 'angle', label: 'Angle', title: 'Angle Measurement' },
    { id: 'roi', label: 'ROI', title: 'Rectangle ROI' }
  ];

  return (
    <div className="toolbar">
      <div className="tool-group">
        <h3>Tools</h3>
        <div className="tool-buttons">
          {tools.map(tool => (
            <button
              key={tool.id}
              className={`tool-btn tool-${tool.id} ${currentTool === tool.id ? 'active' : ''}`}
              onClick={() => onToolChange(tool.id)}
              title={tool.title}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tool-group">
        <h3>Measurements</h3>
        <div className="tool-buttons">
          <button className="tool-btn" onClick={onClearMeasurements} title="Clear all measurements">Clear</button>
        </div>
      </div>

      <div className="tool-group transform-group">
        <h3>Transform</h3>
        <div className="tool-buttons">
          <button className="tool-btn" onClick={() => onRotate(-90)} title="Rotate left 90°">Left</button>
          <button className="tool-btn" onClick={() => onRotate(90)} title="Rotate right 90°">Right</button>
          <button className="tool-btn" onClick={onReset} title="Reset view">Reset</button>
        </div>
      </div>

      <div className="tool-group">
        <h3>Navigation</h3>
        <div className="tool-buttons">
          <button className="tool-btn" onClick={onToggleFileBrowser} title="Toggle file browser">Files</button>
        </div>
      </div>

      {totalFrames > 1 && (
        <div className="tool-group">
          <h3>Frames</h3>
          <div className="frame-info">
            <span>Frame {currentFrame + 1} of {totalFrames}</span>
            <small>Use mouse wheel to navigate</small>
          </div>
        </div>
      )}


      <style jsx>{`
        @media (max-width: 768px) {
          .transform-group { display: none; }
          .tool-length, .tool-angle, .tool-roi { display: none; }
        }
      `}</style>

    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import Toolbar from './Toolbar';
import FileBrowser from './FileBrowser';

export default function CornerstoneViewer({ filename, metadata }) {
  const elementRef = useRef(null);
  const [cornerstone, setCornerstone] = useState(null);
  const [cornerstoneTools, setCornerstoneTools] = useState(null);
  const [currentTool, setCurrentTool] = useState('wwwc');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [viewport, setViewport] = useState(null);

  useEffect(() => {
    initializeCornerstone();
    return () => {
      if (cornerstone && elementRef.current) {
        cornerstone.disable(elementRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (cornerstone && filename) {
      loadDicomImage();
    }
  }, [cornerstone, filename]);

  const initializeCornerstone = async () => {
    try {
      // Dynamic imports to avoid SSR issues
      // const cornerstoneCore = await import('cornerstone-core');
      const cornerstoneCore = await import('cornerstone-core');
      const cornerstoneWADOImageLoader = await import('cornerstone-wado-image-loader');

      const cornerstoneWebImageLoader = await import('cornerstone-web-image-loader');
      const cornerstoneToolsLib = await import('cornerstone-tools');
      const cornerstoneMath = await import('cornerstone-math');
      const dicomParser = await import('dicom-parser');
      const Hammer = await import('hammerjs');

      // Configure cornerstone
      const cornerstone = cornerstoneCore.default || cornerstoneCore;
      // Set up external references for all modules
      const hammer = Hammer.default || Hammer;
      const math = cornerstoneMath.default || cornerstoneMath;
      const parser = dicomParser.default || dicomParser;

      // Initialize cornerstone-math
      if (math.init) {
        math.init();
      }

      // Make cornerstone-math available globally
      if (typeof window !== 'undefined') {
        window.cornerstoneMath = math;
      }

      cornerstone.external = {
        cornerstone: cornerstone,
        Hammer: hammer,
        cornerstoneMath: math,
        dicomParser: parser,
      };

      cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
      cornerstoneWADOImageLoader.external.dicomParser = parser;
      cornerstoneWebImageLoader.external.cornerstone = cornerstone;

      // Configure WADO Image Loader
      cornerstoneWADOImageLoader.configure({
        useWebWorkers: true,
        decodeConfig: {
          convertFloatPixelDataToInt: false,
        },
      });

      // Initialize cornerstone tools
      const cornerstoneTools = cornerstoneToolsLib.default || cornerstoneToolsLib;

      // Ensure all external dependencies are properly set
      cornerstoneTools.external.cornerstone = cornerstone;
      cornerstoneTools.external.Hammer = hammer;
      cornerstoneTools.external.cornerstoneMath = math;

      // Also set global references that some tools might expect
      if (typeof window !== 'undefined') {
        window.cornerstone = cornerstone;
        window.cornerstoneTools = cornerstoneTools;
      }

      cornerstoneTools.init();

      // Add tools
      cornerstoneTools.addTool(cornerstoneTools.WwwcTool);
      cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
      cornerstoneTools.addTool(cornerstoneTools.PanTool);
      cornerstoneTools.addTool(cornerstoneTools.LengthTool);
      cornerstoneTools.addTool(cornerstoneTools.AngleTool);
      cornerstoneTools.addTool(cornerstoneTools.RectangleRoiTool);

      setCornerstone(cornerstone);
      setCornerstoneTools(cornerstoneTools);

      // Enable the element
      if (elementRef.current) {
        cornerstone.enable(elementRef.current);

        // Set initial tool
        cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 });

        // Add scroll event for frame navigation
        elementRef.current.addEventListener('wheel', handleScroll);
      }
    } catch (error) {
      console.error('Error initializing Cornerstone:', error);
    }
  };

  const loadDicomImage = async () => {
    if (!cornerstone || !elementRef.current) return;

    try {
      const imageId = `wadouri:/api/dicom-file/${filename}`;

      // Check for multi-frame
      const frames = parseInt(metadata?.numberOfFrames || '1');
      setTotalFrames(frames);

      const finalImageId = frames > 1 ? `${imageId}#frame=${currentFrame}` : imageId;

      const image = await cornerstone.loadImage(finalImageId);
      cornerstone.displayImage(elementRef.current, image);

      // Store viewport for frame changes
      const currentViewport = cornerstone.getViewport(elementRef.current);
      setViewport(currentViewport);

    } catch (error) {
      console.error('Error loading DICOM image:', error);
    }
  };

  const handleScroll = (e) => {
    if (totalFrames <= 1) return;

    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    const newFrame = Math.max(0, Math.min(totalFrames - 1, currentFrame + delta));

    if (newFrame !== currentFrame) {
      setCurrentFrame(newFrame);
      loadFrameImage(newFrame);
    }
  };

  const loadFrameImage = async (frameIndex) => {
    if (!cornerstone || !elementRef.current) return;

    try {
      const imageId = `wadouri:/api/dicom-file/${filename}#frame=${frameIndex}`;
      const image = await cornerstone.loadImage(imageId);

      // Preserve viewport settings
      if (viewport) {
        cornerstone.displayImage(elementRef.current, image, viewport);
      } else {
        cornerstone.displayImage(elementRef.current, image);
      }
    } catch (error) {
      console.error('Error loading frame:', error);
    }
  };

  const activateTool = (toolName) => {
    if (!cornerstoneTools) return;

    // Deactivate all tools
    cornerstoneTools.setToolPassive('Wwwc');
    cornerstoneTools.setToolPassive('Zoom');
    cornerstoneTools.setToolPassive('Pan');
    cornerstoneTools.setToolPassive('Length');
    cornerstoneTools.setToolPassive('Angle');
    cornerstoneTools.setToolPassive('RectangleRoi');

    // Activate selected tool
    switch (toolName) {
      case 'wwwc':
        cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 });
        break;
      case 'zoom':
        cornerstoneTools.setToolActive('Zoom', { mouseButtonMask: 1 });
        break;
      case 'pan':
        cornerstoneTools.setToolActive('Pan', { mouseButtonMask: 1 });
        break;
      case 'length':
        cornerstoneTools.setToolActive('Length', { mouseButtonMask: 1 });
        break;
      case 'angle':
        cornerstoneTools.setToolActive('Angle', { mouseButtonMask: 1 });
        break;
      case 'roi':
        cornerstoneTools.setToolActive('RectangleRoi', { mouseButtonMask: 1 });
        break;
    }

    setCurrentTool(toolName);
  };

  const clearMeasurements = () => {
    if (!cornerstoneTools || !elementRef.current) return;

    const toolStateManager = cornerstoneTools.globalImageIdSpecificToolStateManager;
    toolStateManager.clear(elementRef.current);
    cornerstone.updateImage(elementRef.current);
  };

  const rotateImage = (degrees) => {
    const newRotation = (rotation + degrees) % 360;
    setRotation(newRotation);

    if (cornerstone && elementRef.current) {
      const viewport = cornerstone.getViewport(elementRef.current);
      viewport.rotation = newRotation;
      cornerstone.setViewport(elementRef.current, viewport);
    }
  };

  const resetView = () => {
    if (cornerstone && elementRef.current) {
      cornerstone.reset(elementRef.current);
      setRotation(0);
    }
  };

  return (
    <div className="cornerstone-container">
      <Toolbar
        currentTool={currentTool}
        onToolChange={activateTool}
        onClearMeasurements={clearMeasurements}
        onRotate={rotateImage}
        onReset={resetView}
        onToggleFileBrowser={() => setShowFileBrowser(!showFileBrowser)}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
      />

      <div className="viewer-content">
        {showFileBrowser && (
          <FileBrowser
            currentFile={filename}
            onFileSelect={(newFilename) => {
              window.location.href = `/viewer/${newFilename}`;
            }}
            onClose={() => setShowFileBrowser(false)}
          />
        )}

        <div className="dicom-viewport">
          <div
            ref={elementRef}
            className="cornerstone-element"
            onContextMenu={(e) => e.preventDefault()}
          />

          {totalFrames > 1 && (
            <div className="frame-info">
              Frame {currentFrame + 1} of {totalFrames}
            </div>
          )}
        </div>
      </div>


    </div>
  );
}

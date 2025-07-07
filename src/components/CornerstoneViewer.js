import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Toolbar from './Toolbar';
import FileBrowser from './FileBrowser';

export default function CornerstoneViewer({ filename, metadata, isAdmin = false }) {
  const elementRef = useRef(null);
  const router = useRouter();
  const [cornerstone, setCornerstone] = useState(null);
  const [cornerstoneTools, setCornerstoneTools] = useState(null);
  const [currentTool, setCurrentTool] = useState('wwwc');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [viewport, setViewport] = useState(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [toolsReady, setToolsReady] = useState(false);

  const totalFramesRef = useRef(totalFrames);
  const currentFramesRef = useRef(currentFrame);
  const cornerstoneRef = useRef(null);

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

  // Handle window resize to ensure canvas is properly sized
  useEffect(() => {
    const handleResize = () => {
      if (cornerstone && elementRef.current) {
        try {
          cornerstone.resize(elementRef.current);
          console.log('Canvas resized for window resize');
        } catch (error) {
          console.error('Error resizing canvas:', error);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [cornerstone]);

  useEffect(() => {
    totalFramesRef.current = totalFrames;
  }, [totalFrames]);

  useEffect(() => {
    currentFramesRef.current = currentFrame;
  }, [currentFrame]);



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
      cornerstoneRef.current = cornerstone; // Store in ref for event handlers

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
        beforeSend: function (xhr) {
          // Add authorization header for DICOM file requests
          const token = isAdmin
            ? localStorage.getItem('admin-auth-token')
            : localStorage.getItem('auth-token');

          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
        }
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
        // Ensure the element has proper dimensions before enabling
        const element = elementRef.current;

        // Force a reflow to ensure dimensions are calculated
        element.offsetHeight;

        cornerstone.enable(element);

        // Verify the element is properly enabled
        const enabledElement = cornerstone.getEnabledElement(element);
        console.log('Enabled element:', enabledElement);

        // Don't activate tools here - wait for image to load first
        console.log('Cornerstone element enabled, waiting for image load to activate tools');

        // Scroll event will be added in separate useEffect
      }
    } catch (error) {
      console.error('Error initializing Cornerstone:', error);
    }
  };

  const loadDicomImage = async () => {
    if (!cornerstone || !elementRef.current) {
      console.error('Cannot load DICOM image: cornerstone or element not available');
      return;
    }

    try {
      setIsLoadingImage(true);
      setToolsReady(false);
      const apiPath = isAdmin
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dicom-file/${encodeURIComponent(filename)}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/dicom-file/${encodeURIComponent(filename)}`;
      const imageId = `wadouri:${apiPath}`;

      console.log('Loading DICOM image from:', apiPath);

      // Check for multi-frame
      const frames = parseInt(metadata?.numberOfFrames || '1');
      setTotalFrames(frames);

      const finalImageId = frames > 1 ? `${imageId}#frame=${currentFrame}` : imageId;

      const image = await cornerstone.loadImage(finalImageId);
      cornerstone.displayImage(elementRef.current, image);

      // Store viewport for frame changes
      const currentViewport = cornerstone.getViewport(elementRef.current);
      setViewport(currentViewport);

      console.log('DICOM image loaded and displayed successfully');

      // Wait for the image to be fully rendered before activating tools
      // This is critical to prevent the race condition in production
      await new Promise(resolve => {
        // Use requestAnimationFrame to ensure the image is fully rendered
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });

      // Now safely initialize tools after image is fully rendered
      if (cornerstoneTools) {
        try {
          // Ensure the canvas is properly sized
          cornerstone.resize(elementRef.current);

          // Ensure canvas has proper event handlers (critical for production)
          const canvas = elementRef.current.querySelector('canvas');
          if (canvas) {
            canvas.style.pointerEvents = 'auto';
            canvas.style.touchAction = 'none';
            console.log('Canvas event handlers configured');
          }

          // Activate the current tool (or default to wwwc)
          const toolToActivate = currentTool || 'wwwc';
          activateTool(toolToActivate);

          // Force a viewport update to ensure tools are properly attached
          const viewport = cornerstone.getViewport(elementRef.current);
          cornerstone.setViewport(elementRef.current, viewport);

          console.log(`Tools activated successfully after image load: ${toolToActivate}`);
          setToolsReady(true);
        } catch (error) {
          console.error('Error activating tools after image load:', error);
        }
      }

    } catch (error) {
      console.error('Error loading DICOM image:', error);
    } finally {
      setIsLoadingImage(false);
    }
  };



  const handleScrollBarClick = (e) => {
    if (totalFrames <= 1) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const scrollBarHeight = rect.height;

    // Calculate which frame to go to based on click position
    const percentage = clickY / scrollBarHeight;
    const newFrame = Math.round(percentage * (totalFrames - 1));
    const clampedFrame = Math.max(0, Math.min(totalFrames - 1, newFrame));

    if (clampedFrame !== currentFrame) {
      setCurrentFrame(clampedFrame);
      loadFrameImage(clampedFrame);
    }
  };

  const activateTool = (toolName) => {
    if (!cornerstoneTools || !elementRef.current) {
      console.error('Cannot activate tool: cornerstoneTools or element not available');
      return;
    }

    try {
      console.log(`Activating tool: ${toolName}`);

      // Ensure the element is still enabled
      const enabledElement = cornerstone.getEnabledElement(elementRef.current);
      if (!enabledElement) {
        console.error('Element is not enabled, cannot activate tools');
        return;
      }

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
      console.log(`Tool ${toolName} activated successfully`);
    } catch (error) {
      console.error(`Error activating tool ${toolName}:`, error);

      // Fallback: try to re-enable the element and retry
      try {
        console.log('Attempting to re-enable element and retry tool activation');
        cornerstone.resize(elementRef.current);

        // Retry tool activation after a brief delay
        setTimeout(() => {
          activateTool(toolName);
        }, 100);
      } catch (fallbackError) {
        console.error('Fallback tool activation also failed:', fallbackError);
      }
    }
  };

  const loadFrameImage = useCallback(async (frameIndex) => {
    if (!cornerstoneRef.current || !elementRef.current) return;

    try {
      const apiPath = isAdmin
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dicom-file/${encodeURIComponent(filename)}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/dicom-file/${encodeURIComponent(filename)}`;
      const imageId = `wadouri:${apiPath}#frame=${frameIndex}`;
      const image = await cornerstoneRef.current.loadImage(imageId);

      // Preserve viewport settings
      if (viewport) {
        cornerstoneRef.current.displayImage(elementRef.current, image, viewport);
      } else {
        cornerstoneRef.current.displayImage(elementRef.current, image);
      }

      // Ensure tools remain active after frame change
      if (cornerstoneTools && currentTool) {
        // Small delay to ensure frame is rendered
        setTimeout(() => {
          try {
            activateTool(currentTool);
          } catch (error) {
            console.error('Error reactivating tool after frame change:', error);
          }
        }, 50);
      }
    } catch (error) {
      console.error('Error loading frame:', error);
    }
  }, [filename, viewport, cornerstoneTools, currentTool, activateTool]); // Add dependencies for useCallback

  const handleScroll = useCallback((e) => {
    if (totalFramesRef.current <= 1) return;

    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    const newFrame = Math.max(0, Math.min(totalFramesRef.current - 1, currentFramesRef.current + delta));

    if (newFrame !== currentFramesRef.current) {
      setCurrentFrame(newFrame);
      loadFrameImage(newFrame);
    }
  }, [loadFrameImage]); // Add loadFrameImage as dependency

  // Add scroll event listener when handleScroll is ready
  useEffect(() => {
    const element = elementRef.current;
    if (element && handleScroll) {
      element.addEventListener('wheel', handleScroll);
      return () => {
        element.removeEventListener('wheel', handleScroll);
      };
    }
  }, [handleScroll]);



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
            isAdmin={isAdmin}
            patientId={filename.split('/')[0]}
            currentFile={filename}
            onFileSelect={(newFilename) => {
              const viewerPath = isAdmin
                ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/viewer/${encodeURIComponent(newFilename)}`
                : `${process.env.NEXT_PUBLIC_APP_URL}/viewer/${encodeURIComponent(newFilename)}`;
              window.location.href = viewerPath;
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

          {/* Loading indicator */}
          {(isLoadingImage || !toolsReady) && (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <div className="loading-text">
                {isLoadingImage ? 'Loading DICOM image...' : 'Initializing tools...'}
              </div>
            </div>
          )}

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

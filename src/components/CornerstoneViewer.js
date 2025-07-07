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
        useWebWorkers: false,
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

      // Add tools globally first
      cornerstoneTools.addTool(cornerstoneTools.WwwcTool);
      cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
      cornerstoneTools.addTool(cornerstoneTools.PanTool);
      cornerstoneTools.addTool(cornerstoneTools.LengthTool);
      cornerstoneTools.addTool(cornerstoneTools.AngleTool);
      cornerstoneTools.addTool(cornerstoneTools.RectangleRoiTool);

      console.log('✅ Tools added globally:', {
        Wwwc: !!cornerstoneTools.WwwcTool,
        Zoom: !!cornerstoneTools.ZoomTool,
        Pan: !!cornerstoneTools.PanTool,
        Length: !!cornerstoneTools.LengthTool,
        Angle: !!cornerstoneTools.AngleTool,
        RectangleRoi: !!cornerstoneTools.RectangleRoiTool
      });

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
        console.log('✅ Enabled element:', enabledElement);

        // CRITICAL: Add tools to this specific enabled element
        try {
          // Add tools to the specific enabled element
          cornerstoneTools.addToolForElement(element, cornerstoneTools.WwwcTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.ZoomTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.PanTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.LengthTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.AngleTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.RectangleRoiTool);

          console.log('✅ Tools added to enabled element');
        } catch (toolError) {
          console.warn('⚠️ addToolForElement failed, tools may already be added:', toolError);
        }

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
            canvas.style.userSelect = 'none';
            canvas.style.cursor = 'crosshair';

            // Force canvas to be focusable and interactive
            canvas.setAttribute('tabindex', '0');
            canvas.setAttribute('role', 'img');

            // Add comprehensive event listeners for debugging
            const eventTypes = ['mousedown', 'mousemove', 'mouseup', 'wheel', 'touchstart', 'touchmove', 'touchend'];
            eventTypes.forEach(eventType => {
              if (!canvas[`_${eventType}Listener`]) {
                const listener = (e) => {
                  console.log(`Canvas ${eventType} event:`, {
                    type: e.type,
                    button: e.button,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    currentTool: currentTool
                  });
                };
                canvas.addEventListener(eventType, listener);
                canvas[`_${eventType}Listener`] = listener;
              }
            });

            console.log('Canvas event handlers configured with comprehensive debugging');
          }

          // Activate the current tool (or default to wwwc)
          const toolToActivate = currentTool || 'wwwc';

          // Multiple attempts to ensure tools are activated in production
          let toolActivated = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              activateTool(toolToActivate);

              // Verify the tool is actually active
              const activeTools = cornerstoneTools.store.state.tools;
              console.log('Active tools after activation:', Object.keys(activeTools));

              toolActivated = true;
              break;
            } catch (toolError) {
              console.warn(`Tool activation attempt ${attempt + 1} failed:`, toolError);
              if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
          }

          // Force a viewport update to ensure tools are properly attached
          const viewport = cornerstone.getViewport(elementRef.current);
          cornerstone.setViewport(elementRef.current, viewport);

          if (toolActivated) {
            console.log(`Tools activated successfully after image load: ${toolToActivate}`);
            setToolsReady(true);
          } else {
            console.error('Failed to activate tools after multiple attempts');
            setToolsReady(false);
          }
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
      console.log(`🔧 Activating tool: ${toolName}`);

      // Ensure the element is still enabled
      const enabledElement = cornerstone.getEnabledElement(elementRef.current);
      if (!enabledElement) {
        console.error('Element is not enabled, cannot activate tools');
        return;
      }

      // Verify tools are available
      const availableTools = {
        Wwwc: !!cornerstoneTools.WwwcTool,
        Zoom: !!cornerstoneTools.ZoomTool,
        Pan: !!cornerstoneTools.PanTool,
        Length: !!cornerstoneTools.LengthTool,
        Angle: !!cornerstoneTools.AngleTool,
        RectangleRoi: !!cornerstoneTools.RectangleRoiTool
      };

      console.log('Available tools:', availableTools);

      // Log current tool state before activation
      const toolState = cornerstoneTools.store.state;
      console.log('Current tool state before activation:', {
        tools: Object.keys(toolState.tools || {}),
        enabledElements: Object.keys(toolState.enabledElements || {}),
        currentTool: toolName
      });

      // Get the element for tool operations
      const element = elementRef.current;

      // Deactivate all tools using standard API
      try {
        cornerstoneTools.setToolPassive('Wwwc');
        cornerstoneTools.setToolPassive('Zoom');
        cornerstoneTools.setToolPassive('Pan');
        cornerstoneTools.setToolPassive('Length');
        cornerstoneTools.setToolPassive('Angle');
        cornerstoneTools.setToolPassive('RectangleRoi');
      } catch (deactivateError) {
        console.warn('Error deactivating tools:', deactivateError);
      }

      // Activate selected tool using standard API with proper configuration
      try {
        const toolConfig = { mouseButtonMask: 1 };

        switch (toolName) {
          case 'wwwc':
            cornerstoneTools.setToolActive('Wwwc', toolConfig);
            break;
          case 'zoom':
            cornerstoneTools.setToolActive('Zoom', toolConfig);
            break;
          case 'pan':
            cornerstoneTools.setToolActive('Pan', toolConfig);
            break;
          case 'length':
            cornerstoneTools.setToolActive('Length', toolConfig);
            break;
          case 'angle':
            cornerstoneTools.setToolActive('Angle', toolConfig);
            break;
          case 'roi':
            cornerstoneTools.setToolActive('RectangleRoi', toolConfig);
            break;
          default:
            console.warn(`Unknown tool: ${toolName}, defaulting to wwwc`);
            cornerstoneTools.setToolActive('Wwwc', toolConfig);
            break;
        }

        console.log(`✅ Tool ${toolName} activated successfully`);
      } catch (activationError) {
        console.error(`❌ Failed to activate tool ${toolName}:`, activationError);

        // Try alternative activation method
        try {
          console.log(`🔄 Trying alternative activation for ${toolName}`);
          switch (toolName) {
            case 'wwwc':
              cornerstoneTools.wwwc.activate(element, 1); // mouseButtonMask 1
              break;
            case 'zoom':
              cornerstoneTools.zoom.activate(element, 1);
              break;
            case 'pan':
              cornerstoneTools.pan.activate(element, 1);
              break;
            default:
              cornerstoneTools.wwwc.activate(element, 1);
              break;
          }
          console.log(`✅ Alternative activation successful for ${toolName}`);
        } catch (altError) {
          console.error(`❌ Alternative activation also failed:`, altError);
          throw activationError; // Re-throw original error for retry logic
        }
      }

      setCurrentTool(toolName);

      // Ensure canvas is properly configured for interaction (critical for production)
      const canvas = elementRef.current.querySelector('canvas');
      if (canvas) {
        canvas.style.pointerEvents = 'auto';
        canvas.style.touchAction = 'none';
        canvas.style.userSelect = 'none';
        canvas.style.cursor = 'crosshair';
        // Force focus to ensure events are captured
        canvas.setAttribute('tabindex', '0');

        // Force canvas to receive focus
        canvas.focus();
      }

      // Force a redraw to ensure tools are properly attached
      cornerstone.updateImage(elementRef.current);

      // Verify tool activation by checking the tool state
      const toolStateAfter = cornerstoneTools.store.state;
      const elementToolState = toolStateAfter.enabledElements?.[enabledElement.uuid];

      console.log(`✅ Tool ${toolName} activation complete:`, {
        toolSet: !!elementToolState,
        availableTools: Object.keys(toolStateAfter.tools || {}),
        elementUuid: enabledElement.uuid,
        canvasConfigured: !!canvas,
        canvasInteractive: canvas?.style.pointerEvents === 'auto'
      });
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

  // Add scroll and touch event listeners for frame navigation
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !handleScroll || totalFramesRef.current <= 1) return;

    let touchStartY = 0;
    let touchStartX = 0;
    let lastTouchTime = 0;

    // Touch start handler for mobile
    const handleTouchStart = (e) => {
      const touch = e.touches[0];
      touchStartY = touch.clientY;
      touchStartX = touch.clientX;
      lastTouchTime = Date.now();
      console.log('📱 Touch start for frame navigation:', { y: touchStartY, frames: totalFramesRef.current });
    };

    // Touch move handler for mobile swipe
    const handleTouchMove = (e) => {
      if (!touchStartY || totalFramesRef.current <= 1) return;

      const touch = e.touches[0];
      const deltaY = touchStartY - touch.clientY;
      const deltaX = touchStartX - touch.clientX;
      const timeDelta = Date.now() - lastTouchTime;

      // Only process vertical swipes that are significant and not too slow
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 50 && timeDelta < 1000) {
        e.preventDefault();

        const direction = deltaY > 0 ? 1 : -1; // Swipe up = next frame, swipe down = previous frame
        const newFrame = Math.max(0, Math.min(totalFramesRef.current - 1, currentFramesRef.current + direction));

        if (newFrame !== currentFramesRef.current) {
          console.log(`📱 Touch swipe: Frame ${currentFramesRef.current} → ${newFrame}`);
          setCurrentFrame(newFrame);
          loadFrameImage(newFrame);
        }

        // Reset touch to prevent multiple triggers
        touchStartY = 0;
        touchStartX = 0;
      }
    };

    // Touch end handler
    const handleTouchEnd = (e) => {
      touchStartY = 0;
      touchStartX = 0;
      lastTouchTime = 0;
    };

    // Add all event listeners
    element.addEventListener('wheel', handleScroll, { passive: false });
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });

    console.log(`📱 Frame navigation events added for ${totalFramesRef.current} frames`);

    return () => {
      element.removeEventListener('wheel', handleScroll);
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleScroll, loadFrameImage]);



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
            style={{
              touchAction: 'none', // Prevent default touch behaviors
              userSelect: 'none',  // Prevent text selection
              WebkitUserSelect: 'none', // Safari
              MozUserSelect: 'none',    // Firefox
              msUserSelect: 'none',     // IE/Edge
              WebkitTouchCallout: 'none', // Prevent iOS callout
              WebkitTapHighlightColor: 'transparent' // Remove tap highlight
            }}
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

          {/* Debug info for production tool debugging */}
          {/* <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.9)',
            color: 'white',
            padding: '8px',
            fontSize: '12px',
            borderRadius: '4px',
            zIndex: 1000,
            fontFamily: 'monospace'
          }}>
            Tools Ready: {toolsReady ? '✅' : '❌'}<br />
            Current Tool: {currentTool || 'None'}<br />
            Frames: {currentFrame + 1}/{totalFrames}<br />
            Mobile: {/Mobi|Android/i.test(navigator.userAgent) ? '📱' : '🖥️'}<br />
            Touch Events: Check console<br />
            <button
              onClick={() => {
                console.log('🧪 Manual tool test - activating pan');
                activateTool('pan');
              }}
              style={{
                fontSize: '10px',
                marginTop: '5px',
                padding: '2px 4px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '2px',
                cursor: 'pointer'
              }}
            >
              Test Pan Tool
            </button>
            {totalFrames > 1 && (
              <div style={{ marginTop: '5px', fontSize: '10px', color: '#ccc' }}>
                📱 Swipe up/down to change frames
              </div>
            )}
          </div> */}
        </div>
      </div>


    </div>
  );
}

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
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [toolsReady, setToolsReady] = useState(false);
  const [studyFiles, setStudyFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [seriesData, setSeriesData] = useState([]);
  const [currentSeriesIndex, setCurrentSeriesIndex] = useState(0);
  const [currentSeriesFileIndex, setCurrentSeriesFileIndex] = useState(0);
  const [isNavigatingInSeries, setIsNavigatingInSeries] = useState(false);

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
      loadStudyFiles(); // Load study files for navigation
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

      // Configure WADO Image Loader with performance optimizations
      cornerstoneWADOImageLoader.configure({
        useWebWorkers: false,
        decodeConfig: {
          convertFloatPixelDataToInt: false,
          // Performance optimizations for main thread processing
          usePDFJS: false, // Disable PDF.js if not needed
          strict: false,   // Less strict parsing for better performance
        },
        // Enable caching for better performance
        maxWebWorkers: 0, // Explicitly disable web workers
        startWebWorkersOnDemand: false,
        webWorkerTaskPaths: [], // Empty array to prevent worker loading
        taskConfiguration: {
          decodeTask: {
            loadCodecsOnStartup: true, // Pre-load codecs for faster decoding
            initializeCodecsOnStartup: false,
            codecsPath: undefined,
            usePDFJS: false,
            strict: false
          }
        },
        beforeSend: function (xhr) {
          // Add authorization header for DICOM file requests
          const token = isAdmin
            ? localStorage.getItem('admin-auth-token')
            : localStorage.getItem('auth-token');

          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }

          // Add cache headers for better performance
          xhr.setRequestHeader('Cache-Control', 'public, max-age=3600');
        }
      });

      console.log('✅ WADO Image Loader configured with performance optimizations');

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
      setLoadingProgress(10);

      const apiPath = isAdmin
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dicom-file/${encodeURIComponent(filename)}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/dicom-file/${encodeURIComponent(filename)}`;
      const imageId = `wadouri:${apiPath}`;

      console.log('⏳ Loading DICOM image from:', apiPath);
      setLoadingProgress(25);

      // Enhanced multi-frame detection
      let frames = parseInt(metadata?.numberOfFrames || '1');

      console.log('📊 DICOM Frame Detection:', {
        filename: filename,
        numberOfFrames: metadata?.numberOfFrames,
        parsedFrames: frames,
        fileSize: 'Large file - should have many frames if 16MB',
        allMetadata: metadata
      });

      // For large files that show only 1 frame, try alternative detection
      if (frames === 1) {
        console.log('⚠️ Only 1 frame detected - trying alternative methods...');

        // Try to detect frames from loaded image data
        try {
          const testImageId = `wadouri:${apiPath}`;
          const testImage = await cornerstone.loadImage(testImageId);

          if (testImage && testImage.data) {
            // Try different DICOM tags for frame count
            const altFrames1 = testImage.data.string('x00280008'); // Number of Frames
            const altFrames2 = testImage.data.uint16('x00280008'); // Number of Frames as uint16
            const altFrames3 = testImage.data.string('x00540081'); // Number of Slices (for some multi-frame)

            console.log('🔍 Alternative frame detection:', {
              stringFrames: altFrames1,
              uint16Frames: altFrames2,
              slicesFrames: altFrames3
            });

            if (altFrames1 && parseInt(altFrames1) > 1) {
              frames = parseInt(altFrames1);
              console.log(`✅ Found ${frames} frames using string method`);
            } else if (altFrames2 && altFrames2 > 1) {
              frames = altFrames2;
              console.log(`✅ Found ${frames} frames using uint16 method`);
            } else if (altFrames3 && parseInt(altFrames3) > 1) {
              frames = parseInt(altFrames3);
              console.log(`✅ Found ${frames} frames using slices method`);
            }
          }
        } catch (error) {
          console.warn('Alternative frame detection failed:', error);
        }
      }

      setTotalFrames(frames);
      setLoadingProgress(40);

      if (frames > 1) {
        console.log(`🎞️ Multi-frame DICOM confirmed: ${frames} frames`);
      } else {
        console.log(`⚠️ Still showing 1 frame for large file - this may be incorrect`);
      }

      const finalImageId = frames > 1 ? `${imageId}#frame=${currentFrame}` : imageId;

      console.log('🔄 Decoding DICOM data...');
      setLoadingProgress(60);

      const image = await cornerstone.loadImage(finalImageId);
      setLoadingProgress(80);

      console.log('🖼️ Displaying image...');
      cornerstone.displayImage(elementRef.current, image);

      // Store viewport for frame changes
      const currentViewport = cornerstone.getViewport(elementRef.current);
      setViewport(currentViewport);
      setLoadingProgress(90);

      console.log('✅ DICOM image loaded and displayed successfully');

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
                  // console.log(`Canvas ${eventType} event:`, {
                  //   type: e.type,
                  //   button: e.button,
                  //   clientX: e.clientX,
                  //   clientY: e.clientY,
                  //   currentTool: currentTool
                  // });
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
            console.log(`✅ Tools activated successfully after image load: ${toolToActivate}`);
            setToolsReady(true);
            setLoadingProgress(100);
          } else {
            console.error('❌ Failed to activate tools after multiple attempts');
            setToolsReady(false);
          }
        } catch (error) {
          console.error('Error activating tools after image load:', error);
        }
      }

    } catch (error) {
      console.error('❌ Error loading DICOM image:', error);
      setLoadingProgress(0);
    } finally {
      setIsLoadingImage(false);
      // Reset progress after a short delay
      setTimeout(() => setLoadingProgress(0), 1000);
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

  // Load study files for navigation
  const loadStudyFiles = async () => {
    try {
      const apiPath = isAdmin
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/study-files/${encodeURIComponent(filename)}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/study-files/${encodeURIComponent(filename)}`;

      const token = isAdmin
        ? `Bearer ${localStorage.getItem('admin-auth-token')}`
        : `Bearer ${localStorage.getItem('auth-token')}`;

      const response = await fetch(apiPath, {
        headers: { 'Authorization': token }
      });

      if (response.ok) {
        const data = await response.json();
        const files = data.files || [];
        const series = data.series || [];

        // Sort files by series number, then by instance number
        const sortedFiles = files.sort((a, b) => {
          if (a.seriesNumber !== b.seriesNumber) {
            return a.seriesNumber - b.seriesNumber;
          }
          return a.instanceNumber - b.instanceNumber;
        });

        setStudyFiles(sortedFiles);
        setSeriesData(series);

        // Find current file index in all files
        const currentIndex = sortedFiles.findIndex(file => file.name === filename);
        setCurrentFileIndex(Math.max(0, currentIndex));

        // Find current series and file index within that series
        const currentSeriesIdx = data.currentSeriesIndex || 0;
        setCurrentSeriesIndex(currentSeriesIdx);

        if (series[currentSeriesIdx]) {
          const currentSeries = series[currentSeriesIdx];
          const fileIndexInSeries = currentSeries.files.findIndex(file => file.name === filename);
          setCurrentSeriesFileIndex(Math.max(0, fileIndexInSeries));
        }

        console.log(`📁 Loaded ${sortedFiles.length} files in ${series.length} series:`,
          series.map(s => `Series ${s.seriesNumber}: ${s.files.length} files (${s.seriesDescription})`));
        console.log(`📍 Current position: Series ${currentSeriesIdx + 1}/${series.length}, File ${(series[currentSeriesIdx]?.files.findIndex(f => f.name === filename) || 0) + 1}/${series[currentSeriesIdx]?.files.length || 0}`);
      }
    } catch (error) {
      console.warn('Could not load study files for navigation:', error);
    }
  };

  // Navigate to previous series
  const goToPreviousSeries = () => {
    if (seriesData.length > 0 && currentSeriesIndex > 0) {
      const previousSeries = seriesData[currentSeriesIndex - 1];
      const firstFileInSeries = previousSeries.files[0];
      if (firstFileInSeries) {
        const viewerPath = isAdmin
          ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/viewer/${encodeURIComponent(firstFileInSeries.name)}`
          : `${process.env.NEXT_PUBLIC_APP_URL}/viewer/${encodeURIComponent(firstFileInSeries.name)}`;
        window.location.href = viewerPath;
      }
    }
  };

  // Navigate to next series
  const goToNextSeries = () => {
    if (seriesData.length > 0 && currentSeriesIndex < seriesData.length - 1) {
      const nextSeries = seriesData[currentSeriesIndex + 1];
      const firstFileInSeries = nextSeries.files[0];
      if (firstFileInSeries) {
        const viewerPath = isAdmin
          ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/viewer/${encodeURIComponent(firstFileInSeries.name)}`
          : `${process.env.NEXT_PUBLIC_APP_URL}/viewer/${encodeURIComponent(firstFileInSeries.name)}`;
        window.location.href = viewerPath;
      }
    }
  };

  // Navigate to previous file within current series
  const goToPreviousFileInSeries = () => {
    if (seriesData.length > 0 && currentSeriesIndex >= 0) {
      const currentSeries = seriesData[currentSeriesIndex];
      if (currentSeries && currentSeriesFileIndex > 0) {
        const previousFile = currentSeries.files[currentSeriesFileIndex - 1];
        const viewerPath = isAdmin
          ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/viewer/${encodeURIComponent(previousFile.name)}`
          : `${process.env.NEXT_PUBLIC_APP_URL}/viewer/${encodeURIComponent(previousFile.name)}`;
        window.location.href = viewerPath;
      }
    }
  };

  // Navigate to next file within current series
  const goToNextFileInSeries = () => {
    if (seriesData.length > 0 && currentSeriesIndex >= 0) {
      const currentSeries = seriesData[currentSeriesIndex];
      if (currentSeries && currentSeriesFileIndex < currentSeries.files.length - 1) {
        const nextFile = currentSeries.files[currentSeriesFileIndex + 1];
        const viewerPath = isAdmin
          ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/viewer/${encodeURIComponent(nextFile.name)}`
          : `${process.env.NEXT_PUBLIC_APP_URL}/viewer/${encodeURIComponent(nextFile.name)}`;
        window.location.href = viewerPath;
      }
    }
  };

  // Navigate to a specific file index within the current series (for smooth scrolling)
  const navigateToFileInSeries = async (fileIndex) => {
    if (seriesData.length > 0 && currentSeriesIndex >= 0) {
      const currentSeries = seriesData[currentSeriesIndex];
      if (currentSeries && fileIndex >= 0 && fileIndex < currentSeries.files.length) {
        const targetFile = currentSeries.files[fileIndex];

        setIsNavigatingInSeries(true);
        setCurrentSeriesFileIndex(fileIndex);

        try {
          // Load the new file directly without changing URL (for smooth navigation)
          const apiPath = isAdmin
            ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dicom-info/${encodeURIComponent(targetFile.name)}`
            : `${process.env.NEXT_PUBLIC_APP_URL}/api/dicom-info/${encodeURIComponent(targetFile.name)}`;

          const token = isAdmin
            ? `Bearer ${localStorage.getItem('admin-auth-token')}`
            : `Bearer ${localStorage.getItem('auth-token')}`;

          const response = await fetch(apiPath, {
            headers: { 'Authorization': token }
          });

          if (response.ok) {
            const newMetadata = await response.json();

            // Load the new DICOM image
            const imageApiPath = isAdmin
              ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dicom-file/${encodeURIComponent(targetFile.name)}`
              : `${process.env.NEXT_PUBLIC_APP_URL}/api/dicom-file/${encodeURIComponent(targetFile.name)}`;

            const imageId = `wadouri:${imageApiPath}`;

            // Check for multi-frame
            const frames = parseInt(newMetadata?.numberOfFrames || '1');
            setTotalFrames(frames);
            setCurrentFrame(0); // Reset to first frame of new file

            const finalImageId = frames > 1 ? `${imageId}#frame=0` : imageId;

            const image = await cornerstone.loadImage(finalImageId);
            cornerstone.displayImage(elementRef.current, image);

            // Reset viewport
            const viewport = cornerstone.getDefaultViewportForImage(elementRef.current, image);
            cornerstone.setViewport(elementRef.current, viewport);
            setViewport(viewport);

            console.log(`📄 Navigated to file ${fileIndex + 1}/${currentSeries.files.length} in series: ${targetFile.name}`);
          }
        } catch (error) {
          console.error('Error navigating to file in series:', error);
        } finally {
          setIsNavigatingInSeries(false);
        }
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
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;

    // Priority 1: Multi-frame navigation within current file
    if (totalFramesRef.current > 1) {
      const newFrame = Math.max(0, Math.min(totalFramesRef.current - 1, currentFramesRef.current + delta));
      if (newFrame !== currentFramesRef.current) {
        setCurrentFrame(newFrame);
        loadFrameImage(newFrame);
        return; // Don't navigate files if we're navigating frames
      }
    }

    // Priority 2: File navigation within current series (for large series like 451 files)
    if (seriesData.length > 0 && currentSeriesIndex >= 0) {
      const currentSeries = seriesData[currentSeriesIndex];
      if (currentSeries && currentSeries.files.length > 1) {
        const newFileIndex = Math.max(0, Math.min(currentSeries.files.length - 1, currentSeriesFileIndex + delta));
        if (newFileIndex !== currentSeriesFileIndex && !isNavigatingInSeries) {
          console.log(`🖱️ Scroll navigation: File ${newFileIndex + 1}/${currentSeries.files.length} in series`);
          navigateToFileInSeries(newFileIndex);
        }
      }
    }
  }, [loadFrameImage, seriesData, currentSeriesIndex, currentSeriesFileIndex, isNavigatingInSeries, navigateToFileInSeries]);

  // Add scroll event listener for desktop only (no touch events to avoid conflicts)
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !handleScroll) return;

    // Check if we need scroll navigation (frames > 1 OR files in series > 1)
    const currentSeries = seriesData[currentSeriesIndex];
    const hasMultipleFrames = totalFramesRef.current > 1;
    const hasMultipleFilesInSeries = currentSeries && currentSeries.files.length > 1;

    if (!hasMultipleFrames && !hasMultipleFilesInSeries) return;

    // Only add wheel events for desktop - no touch events to avoid tool conflicts
    element.addEventListener('wheel', handleScroll, { passive: false });

    if (hasMultipleFrames) {
      console.log(`🖱️ Desktop scroll navigation added for ${totalFramesRef.current} frames`);
    }
    if (hasMultipleFilesInSeries) {
      console.log(`🖱️ Desktop scroll navigation added for ${currentSeries.files.length} files in series`);
    }

    return () => {
      element.removeEventListener('wheel', handleScroll);
    };
  }, [handleScroll, seriesData, currentSeriesIndex]);



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

  // Add keyboard navigation for file switching
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only handle arrow keys if not in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Use Shift+Arrow for series navigation, Arrow for file navigation within series
      if (e.shiftKey && e.key === 'ArrowLeft' && seriesData.length > 1 && currentSeriesIndex > 0) {
        e.preventDefault();
        goToPreviousSeries();
      } else if (e.shiftKey && e.key === 'ArrowRight' && seriesData.length > 1 && currentSeriesIndex < seriesData.length - 1) {
        e.preventDefault();
        goToNextSeries();
      } else if (e.key === 'ArrowLeft' && seriesData.length > 0 && currentSeriesFileIndex > 0) {
        e.preventDefault();
        goToPreviousFileInSeries();
      } else if (e.key === 'ArrowRight' && seriesData.length > 0 && currentSeriesFileIndex < (seriesData[currentSeriesIndex]?.files.length - 1 || 0)) {
        e.preventDefault();
        goToNextFileInSeries();
      }

      // Page Up/Down for faster navigation through large series (jump by 10)
      else if (e.key === 'PageUp' && seriesData.length > 0 && currentSeriesIndex >= 0) {
        e.preventDefault();
        const currentSeries = seriesData[currentSeriesIndex];
        if (currentSeries) {
          const newIndex = Math.max(0, currentSeriesFileIndex - 10);
          if (newIndex !== currentSeriesFileIndex) {
            navigateToFileInSeries(newIndex);
          }
        }
      } else if (e.key === 'PageDown' && seriesData.length > 0 && currentSeriesIndex >= 0) {
        e.preventDefault();
        const currentSeries = seriesData[currentSeriesIndex];
        if (currentSeries) {
          const newIndex = Math.min(currentSeries.files.length - 1, currentSeriesFileIndex + 10);
          if (newIndex !== currentSeriesFileIndex) {
            navigateToFileInSeries(newIndex);
          }
        }
      }

      // Home/End for jumping to first/last file in series
      else if (e.key === 'Home' && seriesData.length > 0 && currentSeriesIndex >= 0) {
        e.preventDefault();
        if (currentSeriesFileIndex !== 0) {
          navigateToFileInSeries(0);
        }
      } else if (e.key === 'End' && seriesData.length > 0 && currentSeriesIndex >= 0) {
        e.preventDefault();
        const currentSeries = seriesData[currentSeriesIndex];
        if (currentSeries && currentSeriesFileIndex !== currentSeries.files.length - 1) {
          navigateToFileInSeries(currentSeries.files.length - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [seriesData, currentSeriesIndex, currentSeriesFileIndex, goToPreviousSeries, goToNextSeries, goToPreviousFileInSeries, goToNextFileInSeries]);

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
            patientId={filename.includes('/') ? filename.split('/')[0].split('_')[0] : filename} // Extract patient ID from folder name
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

          {/* Loading indicator with progress */}
          {(isLoadingImage || !toolsReady) && (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <div className="loading-text">
                {isLoadingImage ? (
                  <>
                    Loading DICOM image... {loadingProgress > 0 && `${loadingProgress}%`}
                    <div style={{
                      width: '200px',
                      height: '4px',
                      backgroundColor: 'rgba(255,255,255,0.3)',
                      borderRadius: '2px',
                      marginTop: '8px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${loadingProgress}%`,
                        height: '100%',
                        backgroundColor: '#007bff',
                        borderRadius: '2px',
                        transition: 'width 0.3s ease'
                      }}></div>
                    </div>
                  </>
                ) : 'Initializing tools...'}
              </div>
            </div>
          )}

          {totalFrames > 1 && (
            <div className="frame-info">
              Frame {currentFrame + 1} of {totalFrames}
            </div>
          )}

          {/* Series Navigation */}
          {seriesData.length > 1 && (
            <>
              {/* Previous Series Button (Left Side) */}
              <button
                onClick={goToPreviousSeries}
                disabled={currentSeriesIndex === 0}
                className={`
                  absolute left-4 top-1/2 transform -translate-y-1/2
                  w-12 h-12 rounded-full flex items-center justify-center
                  transition-all duration-200 shadow-lg z-50
                  ${currentSeriesIndex === 0
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-purple-500 hover:bg-purple-600 active:bg-purple-700 cursor-pointer hover:scale-110'
                  }
                  text-white text-xl font-bold
                `}
                title={`Previous series (${currentSeriesIndex + 1} of ${seriesData.length})`}
              >
                ⟨
              </button>

              {/* Next Series Button (Right Side) */}
              <button
                onClick={goToNextSeries}
                disabled={currentSeriesIndex === seriesData.length - 1}
                className={`
                  absolute right-4 top-1/2 transform -translate-y-1/2
                  w-12 h-12 rounded-full flex items-center justify-center
                  transition-all duration-200 shadow-lg z-40
                  ${currentSeriesIndex === seriesData.length - 1
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-purple-500 hover:bg-purple-600 active:bg-purple-700 cursor-pointer hover:scale-110'
                  }
                  text-white text-xl font-bold
                `}
                title={`Next series (${currentSeriesIndex + 2} of ${seriesData.length})`}
              >
                ⟩
              </button>

              {/* Series Navigation Info */}
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg text-sm z-50">
                <div className="text-center">
                  <div className="font-bold">Series {currentSeriesIndex + 1} of {seriesData.length}</div>
                  <div className="text-xs opacity-80">
                    {seriesData[currentSeriesIndex]?.seriesDescription || 'Unknown Series'}
                  </div>
                  <div className="text-xs opacity-60">
                    File {currentSeriesFileIndex + 1} of {seriesData[currentSeriesIndex]?.files.length || 0} in this series
                  </div>
                </div>
              </div>
            </>
          )}



          {/* Series File Scroll Bar (for large series like 451 files) */}
          {seriesData.length > 0 && seriesData[currentSeriesIndex]?.files.length > 1 && (
            <div className="absolute left-2 top-16 bottom-16 w-6 z-40">
              <div className="relative h-full bg-gray-800 bg-opacity-50 rounded-full">
                {/* Scroll track */}
                <div
                  className="absolute inset-0 rounded-full cursor-pointer"
                  onClick={(e) => {
                    const currentSeries = seriesData[currentSeriesIndex];
                    if (!currentSeries) return;

                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickY = e.clientY - rect.top;
                    const scrollBarHeight = rect.height;
                    const percentage = clickY / scrollBarHeight;
                    const newFileIndex = Math.floor(percentage * currentSeries.files.length);
                    const clampedIndex = Math.max(0, Math.min(currentSeries.files.length - 1, newFileIndex));

                    if (clampedIndex !== currentSeriesFileIndex) {
                      navigateToFileInSeries(clampedIndex);
                    }
                  }}
                />

                {/* Scroll thumb */}
                <div
                  className="absolute w-full bg-indigo-500 rounded-full transition-all duration-200 hover:bg-indigo-400"
                  style={{
                    height: `${Math.max(20, (1 / seriesData[currentSeriesIndex]?.files.length) * 100)}%`,
                    top: `${(currentSeriesFileIndex / (seriesData[currentSeriesIndex]?.files.length - 1)) * (100 - Math.max(20, (1 / seriesData[currentSeriesIndex]?.files.length) * 100))}%`
                  }}
                />

                {/* File count indicator */}
                <div className="absolute -right-16 top-0 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs whitespace-nowrap">
                  {currentSeriesFileIndex + 1} / {seriesData[currentSeriesIndex]?.files.length}
                </div>
              </div>
            </div>
          )}

          {/* Mobile Frame Navigation Buttons */}
          {totalFrames > 1 && (
            <div className="absolute right-16 top-1/2 transform -translate-y-1/2 flex flex-col gap-2 z-50">
              {/* Previous Frame Button */}
              <button
                onClick={() => {
                  if (currentFrame > 0) {
                    setCurrentFrame(currentFrame - 1);
                    loadFrameImage(currentFrame - 1);
                  }
                }}
                disabled={currentFrame === 0}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  transition-all duration-200 shadow-lg
                  ${currentFrame === 0
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 cursor-pointer'
                  }
                  text-white text-lg font-bold
                `}
              >
                ↑
              </button>

              {/* Next Frame Button */}
              <button
                onClick={() => {
                  if (currentFrame < totalFrames - 1) {
                    setCurrentFrame(currentFrame + 1);
                    loadFrameImage(currentFrame + 1);
                  }
                }}
                disabled={currentFrame === totalFrames - 1}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  transition-all duration-200 shadow-lg
                  ${currentFrame === totalFrames - 1
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 cursor-pointer'
                  }
                  text-white text-lg font-bold
                `}
              >
                ↓
              </button>
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
                📱 Use ↑↓ buttons to change frames
              </div>
            )}
          </div> */}
        </div>
      </div>


    </div>
  );
}

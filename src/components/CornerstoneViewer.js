import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Toolbar from './Toolbar';
import FileBrowser from './FileBrowser';

export default function CornerstoneViewer({ filename, metadata, isAdmin = false, onFileBrowserToggle }) {
  const elementRef = useRef(null);
  const router = useRouter();
  const [cornerstone, setCornerstone] = useState(null);
  const [cornerstoneTools, setCornerstoneTools] = useState(null);
  const [currentTool, setCurrentTool] = useState('wwwc');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showFileBrowser, setShowFileBrowser] = useState(true); // Always show on desktop

  // Notify parent component when showFileBrowser changes
  useEffect(() => {
    if (onFileBrowserToggle) {
      onFileBrowserToggle(showFileBrowser);
    }
  }, [showFileBrowser, onFileBrowserToggle]);
  // On initial mount, hide sidebar on mobile viewports
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (isMobile) {
        setShowFileBrowser(false);
        if (onFileBrowserToggle) onFileBrowserToggle(false);
      }
    }
  }, []);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener(update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
    };
  }, []);


  const [viewport, setViewport] = useState(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [toolsReady, setToolsReady] = useState(false);
  const [studyFiles, setStudyFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [seriesData, setSeriesData] = useState([]);
  const [currentSeriesIndex, setCurrentSeriesIndex] = useState(0);
  const [currentSeriesFileIndex, setCurrentSeriesFileIndex] = useState(0);

  // Background preloading state
  const [preloadedImages, setPreloadedImages] = useState(new Map());
  const [preloadQueue, setPreloadQueue] = useState([]);
  const [isPreloading, setIsPreloading] = useState(false);

  // Background preloading configuration
  const PRELOAD_CONFIG = {
    AHEAD_COUNT: 8,     // Preload 8 files ahead
    BEHIND_COUNT: 5,    // Keep 5 files behind in cache
    MAX_CACHE_SIZE: 50, // Maximum cached images
    PRELOAD_DELAY: 50   // Delay between preloads (ms)
  };
  const SERIES_PRELOAD_CONCURRENCY = 3; // Parallel background loads for full-series warmup

  const [isNavigatingInSeries, setIsNavigatingInSeries] = useState(false);

  const totalFramesRef = useRef(totalFrames);
  const currentFramesRef = useRef(currentFrame);
  const cornerstoneRef = useRef(null);

  const wheelThrottleRef = useRef(0);

  const [seriesPreload, setSeriesPreload] = useState({ inProgress: false, total: 0, loaded: 0, errors: 0 });
  const completedSeriesPreloadsRef = useRef(new Set());
  const [firstImageDisplayed, setFirstImageDisplayed] = useState(false);

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

      setLoadingProgress(25);

      // Enhanced multi-frame detection
      let frames = parseInt(metadata?.numberOfFrames || '1');

      // For large files that show only 1 frame, try alternative detection
      if (frames === 1) {

        // Try to detect frames from loaded image data
        try {
          const testImageId = `wadouri:${apiPath}`;
          const testImage = await cornerstone.loadAndCacheImage(testImageId);

          if (testImage && testImage.data) {
            // Try different DICOM tags for frame count
            const altFrames1 = testImage.data.string('x00280008'); // Number of Frames
            const altFrames2 = testImage.data.uint16('x00280008'); // Number of Frames as uint16
            const altFrames3 = testImage.data.string('x00540081'); // Number of Slices (for some multi-frame)

            if (altFrames1 && parseInt(altFrames1) > 1) {
              frames = parseInt(altFrames1);
            } else if (altFrames2 && altFrames2 > 1) {
              frames = altFrames2;
            } else if (altFrames3 && parseInt(altFrames3) > 1) {
              frames = parseInt(altFrames3);
            }
          }
        } catch (error) {
          console.warn('Alternative frame detection failed:', error);
        }
      }

      setTotalFrames(frames);
      setLoadingProgress(40);

      const finalImageId = frames > 1 ? `${imageId}#frame=${currentFrame}` : imageId;

      setLoadingProgress(60);

      const image = await cornerstone.loadAndCacheImage(finalImageId);
      setLoadingProgress(80);

      cornerstone.displayImage(elementRef.current, image);

      // Mark first image displayed to trigger series background preload
      setFirstImageDisplayed(true);


      // Store viewport for frame changes
      const currentViewport = cornerstone.getViewport(elementRef.current);
      setViewport(currentViewport);
      setLoadingProgress(90);

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

      // Log current tool state before activation
      const toolState = cornerstoneTools.store.state;

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

        // Start background preloading for the current series
        if (series[currentSeriesIdx] && series[currentSeriesIdx].files.length > 1) {
          const currentFileIndex = series[currentSeriesIdx].files.findIndex(f => f.name === filename);
          console.log(`🔄 Initiating background preloading for series with ${series[currentSeriesIdx].files.length} files`);
          setTimeout(() => {
            startBackgroundPreloading(Math.max(0, currentFileIndex));
          }, 1000); // Small delay to let the current image load first
        }
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
          // Check if image is already preloaded
          const cacheKey = `${targetFile.name}`;
          if (preloadedImages.has(cacheKey)) {
            const cachedData = preloadedImages.get(cacheKey);

            // Display cached image
            cornerstone.displayImage(elementRef.current, cachedData.image);

            // Set metadata and frames
            setTotalFrames(cachedData.frames);
            setCurrentFrame(0);

            // Reset viewport
            const viewport = cornerstone.getDefaultViewportForImage(elementRef.current, cachedData.image);
            cornerstone.setViewport(elementRef.current, viewport);
            setViewport(viewport);

          } else {
            // Load directly without metadata call; cornerstone caches the image
            const imageApiPath = isAdmin
              ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dicom-file/${encodeURIComponent(targetFile.name)}`
              : `${process.env.NEXT_PUBLIC_APP_URL}/api/dicom-file/${encodeURIComponent(targetFile.name)}`;
            const imageIdBase = `wadouri:${imageApiPath}`;

            // Load first frame (or single frame) and detect total frames from dataset
            const image = await cornerstone.loadAndCacheImage(imageIdBase);

            // Detect number of frames from DICOM tags when available
            let frames = 1;
            try {
              const data = image?.data;
              if (data) {
                const alt1 = parseInt(data.string?.('x00280008') || '1', 10);
                const alt2 = data.uint16 ? data.uint16('x00280008') : undefined;
                if (!isNaN(alt1) && alt1 > 1) frames = alt1;
                else if (typeof alt2 === 'number' && alt2 > 1) frames = alt2;
              }
            } catch { }

            setTotalFrames(frames);
            setCurrentFrame(0);

            cornerstone.displayImage(elementRef.current, image);

            // Reset viewport
            const viewport = cornerstone.getDefaultViewportForImage(elementRef.current, image);
            cornerstone.setViewport(elementRef.current, viewport);
            setViewport(viewport);

            console.log(`📄 Navigated to file ${fileIndex + 1}/${currentSeries.files.length} in series: ${targetFile.name}`);
          }

          // Start background preloading for surrounding files
          startBackgroundPreloading(fileIndex);
        } catch (error) {
          console.error('Error navigating to file in series:', error);
        } finally {
          setIsNavigatingInSeries(false);
        }
      }
    }
  };

  // Background preloading functions
  const startBackgroundPreloading = (currentIndex) => {
    if (!seriesData[currentSeriesIndex] || isPreloading) return;

    const currentSeries = seriesData[currentSeriesIndex];
    const filesToPreload = [];

    // Add files ahead of current position
    for (let i = 1; i <= PRELOAD_CONFIG.AHEAD_COUNT; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < currentSeries.files.length) {
        const file = currentSeries.files[nextIndex];
        const cacheKey = `${file.name}`;
        if (!preloadedImages.has(cacheKey)) {
          filesToPreload.push({ file, index: nextIndex, priority: i });
        }
      }
    }

    // Add files behind current position (lower priority)
    for (let i = 1; i <= PRELOAD_CONFIG.BEHIND_COUNT; i++) {
      const prevIndex = currentIndex - i;
      if (prevIndex >= 0) {
        const file = currentSeries.files[prevIndex];
        const cacheKey = `${file.name}`;
        if (!preloadedImages.has(cacheKey)) {
          filesToPreload.push({ file, index: prevIndex, priority: PRELOAD_CONFIG.AHEAD_COUNT + i });
        }
      }
    }

    // Sort by priority (lower number = higher priority)
    filesToPreload.sort((a, b) => a.priority - b.priority);

    if (filesToPreload.length > 0) {
      setPreloadQueue(filesToPreload);
      processPreloadQueue(filesToPreload);
    }
  };

  const processPreloadQueue = async (queue) => {
    if (isPreloading || queue.length === 0) return;

    setIsPreloading(true);

    for (const item of queue) {
      try {
        await preloadFile(item.file);

        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, PRELOAD_CONFIG.PRELOAD_DELAY));

        // Check if we should stop (user navigated away from series)
        const currentSeries = seriesData[currentSeriesIndex];
        if (!currentSeries || !currentSeries.files.includes(item.file)) {
          break;
        }
      } catch (error) {
        console.warn(`⚠️ Failed to preload ${item.file.name}:`, error);
      }
    }

    setIsPreloading(false);
    setPreloadQueue([]);
  };

  const preloadFile = async (file) => {
    const cacheKey = `${file.name}`;

    if (preloadedImages.has(cacheKey)) {
      return; // Already cached
    }

    try {
      // Load image directly (no separate metadata call)
      const imageApiPath = isAdmin
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dicom-file/${encodeURIComponent(file.name)}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/dicom-file/${encodeURIComponent(file.name)}`;

      const imageIdBase = `wadouri:${imageApiPath}`;
      const image = await cornerstone.loadAndCacheImage(imageIdBase);

      // Detect number of frames from dataset if available
      let frames = 1;
      try {
        const data = image?.data;
        if (data) {
          const alt1 = parseInt(data.string?.('x00280008') || '1', 10);
          const alt2 = data.uint16 ? data.uint16('x00280008') : undefined;
          if (!isNaN(alt1) && alt1 > 1) frames = alt1;
          else if (typeof alt2 === 'number' && alt2 > 1) frames = alt2;
        }
      } catch { }

      // Cache the loaded image and computed frames
      const cachedData = {
        image,
        frames,
        timestamp: Date.now()
      };

      // Manage cache size
      if (preloadedImages.size >= PRELOAD_CONFIG.MAX_CACHE_SIZE) {
        // Remove oldest cached image
        const oldestKey = Array.from(preloadedImages.keys())[0];
        setPreloadedImages(prev => {
          const newMap = new Map(prev);
          newMap.delete(oldestKey);
          return newMap;
        });
      }

      setPreloadedImages(prev => new Map(prev.set(cacheKey, cachedData)));


    } catch (error) {
      console.warn(`❌ Failed to preload ${file.name}:`, error);
      throw error;
    }
  };

  const loadFrameImage = useCallback(async (frameIndex) => {
    if (!cornerstoneRef.current || !elementRef.current) return;

    try {
      const apiPath = isAdmin
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dicom-file/${encodeURIComponent(filename)}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/dicom-file/${encodeURIComponent(filename)}`;
      const imageId = `wadouri:${apiPath}#frame=${frameIndex}`;
      const image = await cornerstoneRef.current.loadAndCacheImage(imageId);


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

    // Throttle to avoid flooding requests on slow networks
    const now = Date.now();
    if (now - wheelThrottleRef.current < 60) return;
    wheelThrottleRef.current = now;

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

  // Background: preload entire current series and show progress
  const preloadEntireSeries = useCallback(async (series, key) => {
    if (!series || !Array.isArray(series.files) || series.files.length === 0) return;
    setSeriesPreload({ inProgress: true, total: series.files.length, loaded: 0, errors: 0 });

    let loaded = 0;
    let errors = 0;
    const files = series.files.slice();
    let index = 0;

    const worker = async () => {
      while (true) {
        const i = index++;
        if (i >= files.length) break;
        const f = files[i];
        try {
          const cacheKey = `${f.name}`;
          if (!preloadedImages.has(cacheKey)) {
            await preloadFile(f);
          }
        } catch (e) {
          errors++;
        } finally {
          loaded++;
          setSeriesPreload(prev => ({ ...prev, loaded, errors }));
        }
        // Tiny delay to keep UI responsive
        await new Promise(res => setTimeout(res, 10));
      }
    };

    const workers = Array.from({ length: Math.min(SERIES_PRELOAD_CONCURRENCY, files.length) }, () => worker());
    await Promise.all(workers);

    completedSeriesPreloadsRef.current.add(key);
    setSeriesPreload(prev => ({ ...prev, inProgress: false }));
  }, [preloadedImages, preloadFile]);

  // Kick off series preload after first image is displayed
  useEffect(() => {
    const series = seriesData[currentSeriesIndex];
    if (!firstImageDisplayed || !series || !series.files?.length) return;
    const key = `${series.seriesNumber || currentSeriesIndex}-${series.files.length}`;
    if (seriesPreload.inProgress || completedSeriesPreloadsRef.current.has(key)) return;
    preloadEntireSeries(series, key);
  }, [firstImageDisplayed, seriesData, currentSeriesIndex, seriesPreload.inProgress, preloadEntireSeries]);

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
        navigateToFileInSeries(currentSeriesFileIndex - 1);
      } else if (e.key === 'ArrowRight' && seriesData.length > 0 && currentSeriesFileIndex < (seriesData[currentSeriesIndex]?.files.length - 1 || 0)) {
        e.preventDefault();
        navigateToFileInSeries(currentSeriesFileIndex + 1);
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
    <div className="cornerstone-container" style={{
      marginLeft: showFileBrowser ? '350px' : '0',
      transition: 'margin-left 0.3s ease',
      width: showFileBrowser ? 'calc(100% - 350px)' : '100%'
    }}>
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

          {/* Series background preloading progress */}
          {seriesPreload.inProgress && seriesPreload.total > 0 && (
            <div className="absolute left-1/2 transform -translate-x-1/2 bottom-3 z-50 px-3 py-2 bg-black bg-opacity-60 rounded">
              <div className="flex items-center gap-2 text-white text-xs">
                <div className="w-40 h-1.5 bg-gray-700 rounded overflow-hidden">
                  <div
                    className="h-1.5 bg-purple-500"
                    style={{ width: `${Math.round((seriesPreload.loaded / seriesPreload.total) * 100)}%` }}
                  />
                </div>
                <span>{Math.round((seriesPreload.loaded / seriesPreload.total) * 100)}%</span>
              </div>
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
          {!isMobile && seriesData.length > 0 && seriesData[currentSeriesIndex]?.files.length > 1 && (
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

          {/* Mobile Series File Navigation (Up/Down arrows) */}
          {false && isMobile && seriesData.length > 0 && seriesData[currentSeriesIndex]?.files.length > 1 && (
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 flex flex-col gap-3 z-50">
              {/* Previous file in series */}
              <button
                onClick={goToPreviousFileInSeries}
                disabled={currentSeriesFileIndex === 0}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center
                  transition-all duration-200 shadow-lg
                  ${currentSeriesFileIndex === 0
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-purple-500 hover:bg-purple-600 active:bg-purple-700 cursor-pointer hover:scale-110'}
                  text-white text-xl font-bold
                `}
                title="Previous file in series"
              >
                F3333 
                 0 0 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
                 0
              </button>

              {/* Next file in series */}
              <button
                onClick={goToNextFileInSeries}
                disabled={currentSeriesFileIndex === (seriesData[currentSeriesIndex]?.files.length - 1)}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center
                  transition-all duration-200 shadow-lg
                  ${currentSeriesFileIndex === (seriesData[currentSeriesIndex]?.files.length - 1)
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-purple-500 hover:bg-purple-600 active:bg-purple-700 cursor-pointer hover:scale-110'}
                  text-white text-xl font-bold
                `}
                title="Next file in series"
              >
                 0
              </button>
            </div>
          )}



          {/* Mobile Series File Navigation (clean buttons) */}
          {isMobile && seriesData.length > 0 && seriesData[currentSeriesIndex]?.files.length > 1 && (
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 flex flex-col gap-3 z-50">
              <button
                onClick={() => navigateToFileInSeries(currentSeriesFileIndex - 1)}
                disabled={currentSeriesFileIndex === 0}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center
                  transition-all duration-200 shadow-lg
                  ${currentSeriesFileIndex === 0
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-purple-500 hover:bg-purple-600 active:bg-purple-700 cursor-pointer hover:scale-110'}
                  text-white text-xl font-bold
                `}
                title="Previous file in series"
                aria-label="Previous file in series"
              >
                ↑
              </button>

              <button
                onClick={() => navigateToFileInSeries(currentSeriesFileIndex + 1)}
                disabled={currentSeriesFileIndex === (seriesData[currentSeriesIndex]?.files.length - 1)}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center
                  transition-all duration-200 shadow-lg
                  ${currentSeriesFileIndex === (seriesData[currentSeriesIndex]?.files.length - 1)
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-purple-500 hover:bg-purple-600 active:bg-purple-700 cursor-pointer hover:scale-110'}
                  text-white text-xl font-bold
                `}
                title="Next file in series"
                aria-label="Next file in series"
              >
                ↓
              </button>
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

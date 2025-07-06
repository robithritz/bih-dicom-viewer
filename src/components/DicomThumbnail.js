import { useEffect, useRef, useState } from 'react';

const DicomThumbnail = ({ filename, size = 150, className = '' }) => {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {

    if (filename) {
      generateThumbnail();
    }
  }, [filename, size, canvasRef.current]);

  const generateThumbnail = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${process.env.APP_URL}/api/dicom-thumbnail/${filename}`);
      if (!response.ok) {
        throw new Error('Failed to load thumbnail');
      }

      console.log("loadede thumnail" + filename);

      const imageData = await response.json();
      const canvas = canvasRef.current;
      console.log("the canvas " + canvas);
      if (!canvas) {
        setLoading(false);
        return;
      }

      const ctx = canvas.getContext('2d');
      canvas.width = size;
      canvas.height = size;

      // Create ImageData object
      const imgData = ctx.createImageData(imageData.width, imageData.height);
      imgData.data.set(new Uint8ClampedArray(imageData.data));

      // Draw the image data to canvas
      ctx.putImageData(imgData, 0, 0);

      // If the thumbnail size is different from the generated size, scale it
      if (imageData.width !== size || imageData.height !== size) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        tempCtx.putImageData(imgData, 0, 0);

        // Clear main canvas and draw scaled image
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(tempCanvas, 0, 0, size, size);
      }

      console.log("till put image")

      setLoading(false);
    } catch (err) {
      console.error('Error generating thumbnail:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        className={`dicom-thumbnail loading ${className}`}
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#2a2a2a',
          border: '1px solid #444',
          borderRadius: '4px'
        }}
      >
        <div style={{ color: '#ccc', fontSize: '12px' }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`dicom-thumbnail error ${className}`}
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#3a2a2a',
          border: '1px solid #644',
          borderRadius: '4px'
        }}
      >
        <div style={{ color: '#f88', fontSize: '10px', textAlign: 'center' }}>
          Error<br />loading<br />image
        </div>
      </div>
    );
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`dicom-thumbnail ${className}`}
        style={{
          border: '1px solid #444',
          borderRadius: '4px',
          backgroundColor: '#000'
        }}
      />
      <div style={{ color: 'red' }}>
        Canvas ref: {canvasRef.current ? "Exists" : "NULL"}
      </div>
    </>
  );
};

export default DicomThumbnail;

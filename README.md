# Advanced DICOM Viewer

A comprehensive Node.js Express application for viewing and analyzing DICOM medical imaging files with professional-grade tools.

## Features

### 🏥 Medical Imaging Display
- **Real DICOM Rendering**: Powered by Cornerstone.js for accurate medical image display
- **Multi-Series Support**: Organized view of studies and series with navigation
- **Instance Navigation**: Browse through image sequences with slider and buttons

### 🛠️ Professional Tools
- **Window/Level Adjustment**: Interactive windowing controls for optimal image contrast
- **Zoom & Pan**: Precise image navigation with mouse and touch support
- **Measurement Tools**: Length, angle, and ROI (Region of Interest) measurements
- **Image Manipulation**: Invert, reset, and viewport controls

### 📊 Data Organization
- **Study-Level Organization**: Groups images by patient studies
- **Series Management**: Automatic series detection and organization
- **Comprehensive Metadata**: Detailed DICOM tag information display
- **Collection Statistics**: Overview of studies and image counts

## Prerequisites

- Node.js (version 12 or higher)
- npm (Node Package Manager)

## Installation

1. Clone or navigate to the project directory
2. Install dependencies:
   ```bash
   npm install
   ```

## DICOM Storage Structure

This application uses a **multi-tier fallback system** for DICOM file storage with three directories:

### Directory Paths

| Directory | Path | Purpose |
|-----------|------|---------|
| **DICOM** | `./DICOM/` | Primary storage - first choice for file storage and retrieval |
| **DICOM2** | `./DICOM2/` | Secondary fallback - used when file not found in DICOM |
| **DICOM3** | `./DICOM3/` | Tertiary fallback - final fallback when file not found in DICOM or DICOM2 |

### How It Works

1. **Primary Storage (DICOM)**: When files are uploaded, they are stored in the `DICOM` directory, organized in subfolders named after patient identifiers (e.g., `DICOM/000012_0001/`)

2. **Fallback Mechanism**: When retrieving files, the system checks directories in this order:
   - First tries `DICOM/` directory
   - If file not found, tries `DICOM2/` directory
   - If file not found, tries `DICOM3/` directory
   - Returns 404 if file not found in any directory

3. **Migration Support**: This structure allows gradual migration from older storage locations to new ones.

### Directory Structure Example

```
bih-dicom-viewer/
├── DICOM/                    # Primary DICOM storage
│   ├── 000012_0001/          # Patient folder (URN_episodeId)
│   │   ├── image1.dcm
│   │   └── image2.dcm
│   └── 000013_0002/
│       └── image1.dcm
├── DICOM2/                   # Secondary/fallback storage
│   └── ...
├── DICOM3/                   # Tertiary/fallback storage
│   └── ...
```

### File Path Resolution

The application constructs file paths based on patient ID and filename. For example:
- Patient ID: `000012_0001`, Filename: `image1.dcm`
- Resulting paths (checked in order):
  1. `./DICOM/000012_0001/image1.dcm`
  2. `./DICOM2/000012_0001/image1.dcm`
  3. `./DICOM3/000012_0001/image1.dcm`

## Usage

1. **Admin Upload**: Log in to admin portal and upload ZIP files containing DICOM files
2. **File Organization**: Files are automatically organized by patient ID into the `DICOM` directory
3. **Start the server**:
   ```bash
   npm start
   ```
4. **Access**: Open your browser and navigate to `http://localhost:3000`

## API Endpoints

- `GET /` - Main gallery interface with study/series organization
- `GET /viewer/:filename` - Advanced DICOM viewer for individual images
- `GET /dicom-info/:filename` - Get detailed metadata for a specific DICOM file
- `GET /dicom-image/:filename` - Get enhanced image information with Cornerstone.js data
- `GET /dicom-file/:filename` - Serve raw DICOM files for Cornerstone.js rendering
- `GET /series-files/:filename` - Get all files in the same series as the specified file

## Viewer Tools

### 🎛️ Window/Level Controls
- **Interactive Sliders**: Real-time window width and center adjustment
- **Numeric Input**: Precise value entry for clinical requirements
- **Automatic Detection**: Uses DICOM metadata for initial settings

### 🔍 Navigation Tools
- **Zoom Tool**: Mouse wheel and drag zoom functionality
- **Pan Tool**: Click and drag to navigate large images
- **Reset View**: One-click return to original view settings

### 📏 Measurement Tools
- **Length Measurement**: Calibrated distance measurements
- **Angle Measurement**: Precise angle calculations
- **Rectangle ROI**: Area selection and analysis
- **Pixel Value Display**: Real-time pixel intensity values

### 📚 Series Navigation
- **Multi-Instance Browsing**: Navigate through image sequences
- **Series Selector**: Switch between different series in a study
- **Instance Slider**: Quick navigation to specific images
- **Keyboard Shortcuts**: Arrow keys for rapid browsing

## Technical Implementation

This application now includes full medical imaging capabilities:

### ✅ Implemented Features
- **Cornerstone.js Integration**: Professional medical image rendering
- **DICOM Parsing**: Complete metadata extraction and display
- **Series Organization**: Automatic grouping by study and series
- **Interactive Tools**: Full suite of measurement and navigation tools
- **Responsive Design**: Works on desktop and tablet devices

### 🔧 Architecture
- **Backend**: Node.js with Express framework
- **DICOM Processing**: dicom-parser for metadata extraction
- **Frontend**: Cornerstone.js ecosystem for medical imaging
- **UI Framework**: Custom CSS with medical imaging color schemes

## File Structure

```
bih-dicom-viewer/
├── DICOM/              # Directory containing DICOM files
├── views/              # EJS templates
│   └── index.ejs       # Main viewer template
├── public/             # Static assets
├── server.js           # Express server
├── package.json        # Node.js dependencies
└── README.md          # This file
```

## Dependencies

### Backend Dependencies
- **express** - Web framework for server and API
- **dicom-parser** - DICOM file parsing and metadata extraction
- **ejs** - Template engine for dynamic HTML generation
- **fs-extra** - Enhanced file system utilities
- **multer** - File upload handling capabilities
- **path** - Path utilities for file management

### Frontend Dependencies (CDN)
- **cornerstone-core** - Core medical imaging display engine
- **cornerstone-math** - Mathematical utilities for imaging
- **cornerstone-tools** - Interactive tools for measurements
- **cornerstone-web-image-loader** - Web image format support
- **cornerstone-wado-image-loader** - DICOM WADO image loading
- **hammerjs** - Touch gesture support for mobile devices

## Usage Guide

### 1. Gallery View
- Browse studies organized by patient and date
- View series information and image counts
- Click "Open Viewer" to examine individual images

### 2. Advanced Viewer
- **Left Panel**: Image metadata and controls
- **Main Area**: DICOM image display with tools
- **Toolbar**: Tool selection and image manipulation

### 3. Tool Usage
- **W/L Tool**: Click and drag to adjust window/level
- **Zoom Tool**: Click and drag to zoom in/out
- **Pan Tool**: Click and drag to move the image
- **Measurement Tools**: Click to start, click again to finish
- **Series Navigation**: Use controls to browse image sequences

## Development

To run in development mode:
```bash
npm run dev
```

## Contributing

Feel free to submit issues and enhancement requests!

## License

ISC License

# ICAO Passport Photo Studio

A professional-grade, python-based web application to convert regular portrait images into ICAO standard-compliant passport and visa photographs. 

Powered by **FastAPI** on the backend, **Cropper.js** with customized **SVG guidelines overlays** on the frontend, and **OpenCV + Pillow** for robust face detection, automatic alignment, background removal, and print-sheet generation.

---

## 🌟 Features

- **Automatic Face Detection & Alignment**: Automatically detects the face and eyes using Haar Cascades. If tilted, it calculates the tilt angle and rotates the image so the eyes are perfectly aligned horizontally.
- **Smart Crop Recommendations**: Pre-calculates crop rectangles that center the face and place eyes/chin at the exact vertical proportions required by various immigration guidelines.
- **Country & Document Specific Templates**:
  - **United States**: Passport and Visa (2x2 inches / 51x51 mm, 50-69% face height).
  - **India**: Passport (2x2 inches / 51x51 mm, 70-80% face height) and Visa (35x45 mm, 70-80% face height).
  - **ICAO Generic**: Standard EU/UK size (35x45 mm, 70-80% face height).
- **Interactive Crop & Dynamic SVG Overlays**: Syncs an SVG overlay (showing standard face oval, center axes, eye and chin guidelines) *exactly* on top of the interactive crop box.
- **Advanced Background Removal**: Employs an optimized, downscaled OpenCV GrabCut algorithm using a face-oval seed (definite foreground) and image borders (definite background) to output smooth, clean cutouts in milliseconds.
- **Color Customization**: Replace the background with Pure White, Off-White, Light Blue, or Light Gray to satisfy specific embassy guidelines.
- **Real-time Image Enhancements**: Adjust brightness, contrast, saturation, and rotation with sliders providing instant visual preview in the browser before final high-fidelity rendering.
- **Print Layout Sheet Generator**: Tiles 6 copies of the processed photograph onto a standard 4x6 inch print template (1200x1800 px at 300 DPI) complete with light-gray cut lines.

---

## 📁 Project Structure

- [main.py](file:///home/binish/dev/me/passport-photo/main.py): FastAPI server containing the core logic for face alignment, crop recommendation, GrabCut background replacement, and 4x6 sheet tiling.
- [static/index.html](file:///home/binish/dev/me/passport-photo/static/index.html): Clean, single-page wizard interface with Lucide-style SVG icons and clear ICAO check guidelines.
- [static/style.css](file:///home/binish/dev/me/passport-photo/static/style.css): Slate dark-mode styling with clean grids, sliders, toggle switches, and responsive layouts.
- [static/app.js](file:///home/binish/dev/me/passport-photo/static/app.js): Handles drag-and-drop file upload, Cropper.js sync, specifications updating, real-time CSS filters, and API orchestration.
- [static/assets/sample.jpg](file:///home/binish/dev/me/passport-photo/static/assets/sample.jpg): A high-quality AI-generated sample portrait to let users experience the full flow instantly.

---

## 🚀 Getting Started

### Prerequisites

Make sure you have [Astral uv](https://github.com/astral-sh/uv) installed.

### Run the Application

Start the FastAPI development server:

```bash
uv run uvicorn main:app --reload
```

Once started, open your browser and navigate to:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

### Testing with the Sample Photo
If you don't have a portrait photo ready, click the **"Try with Sample Photo"** button on the upload screen to test the auto-alignment and background removal instantly.

> [!NOTE]
> The sample portrait image (`sample.jpg`) is synthetic/AI-generated. It is completely safe to commit, share, and distribute online without any copyright or legal issues.

/**
 * ICAO Passport Photo Studio Frontend Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // State Variables
    let cropper = null;
    let originalImageBase64 = null; // Stored aligned image base64
    let faceData = null; // Detected face coordinates
    let eyesData = null; // Detected eyes coordinates
    let recommendations = null; // Recommendations from backend
    let currentSpec = 'us_passport'; // Current active specification key
    
    // Specifications DB
    const SPECS = {
        us_passport: {
            name: "US Passport",
            width: 600,
            height: 600,
            aspectRatio: 1.0,
            dimText: "2 x 2 inches (51 x 51 mm)",
            rulesText: "Face: 50%-69% of height. Eyes: 56%-69% from bottom.",
            overlayId: "guide-face-oval-us",
            eyeY: 38, // % from top (100 - 62)
            chinY: 74  // % from top (100 - 26)
        },
        us_visa: {
            name: "US Visa",
            width: 600,
            height: 600,
            aspectRatio: 1.0,
            dimText: "2 x 2 inches (51 x 51 mm)",
            rulesText: "Face: 50%-69% of height. Eyes: 56%-69% from bottom.",
            overlayId: "guide-face-oval-us",
            eyeY: 38,
            chinY: 74
        },
        in_passport: {
            name: "India Passport",
            width: 630,
            height: 810,
            aspectRatio: 35 / 45,
            dimText: "35 x 45 mm (3.5 x 4.5 cm)",
            rulesText: "Face: 70%-80% of height. Centered vertically and horizontally.",
            overlayId: "guide-face-oval",
            eyeY: 40,
            chinY: 78,
            dpi: 457
        },
        in_visa: {
            name: "India Visa",
            width: 600,
            height: 600,
            aspectRatio: 1.0,
            dimText: "2 x 2 inches (51 x 51 mm)",
            rulesText: "Face: 70%-80% of height. Centered vertically and horizontally.",
            overlayId: "guide-face-oval",
            eyeY: 42,
            chinY: 78
        },
        icao_generic: {
            name: "ICAO / EU Passport",
            width: 413,
            height: 531,
            aspectRatio: 35 / 45,
            dimText: "35 x 45 mm (3.5 x 4.5 cm)",
            rulesText: "Face: 70%-80% of height. Centered, plain light background.",
            overlayId: "guide-face-oval",
            eyeY: 40,
            chinY: 78
        }
    };

    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const btnUseSample = document.getElementById('btn-use-sample');
    
    const viewUpload = document.getElementById('view-upload');
    const viewEditor = document.getElementById('view-editor');
    const viewExport = document.getElementById('view-export');
    
    const imageToCrop = document.getElementById('image-to-crop');
    const guidelinesOverlay = document.getElementById('guidelines-overlay');
    const guideFaceOval = document.getElementById('guide-face-oval');
    const guideFaceOvalUs = document.getElementById('guide-face-oval-us');
    const guideEyeLine = document.getElementById('guide-eye-line');
    const guideChinLine = document.getElementById('guide-chin-line');
    
    const faceDetectStatus = document.getElementById('face-detect-status');
    const selectCountry = document.getElementById('select-country');
    const typePassport = document.getElementById('type-passport');
    const typeVisa = document.getElementById('type-visa');
    
    // Custom overrides DOM
    const chkOverrideDimensions = document.getElementById('chk-override-dimensions');
    const overrideInputsContainer = document.getElementById('override-inputs-container');
    const inputCustomWidth = document.getElementById('input-custom-width');
    const inputCustomHeight = document.getElementById('input-custom-height');
    const inputCustomDpi = document.getElementById('input-custom-dpi');
    const inputCustomDimText = document.getElementById('input-custom-dimtext');
    
    const specName = document.getElementById('spec-name');
    const specDim = document.getElementById('spec-dim');
    const specRules = document.getElementById('spec-rules');
    
    // Sliders
    const sliderBrightness = document.getElementById('slider-brightness');
    const sliderContrast = document.getElementById('slider-contrast');
    const sliderSaturation = document.getElementById('slider-saturation');
    const sliderRotation = document.getElementById('slider-rotation');
    
    const valBrightness = document.getElementById('val-brightness');
    const valContrast = document.getElementById('val-contrast');
    const valSaturation = document.getElementById('val-saturation');
    const valRotation = document.getElementById('val-rotation');
    
    // Background Removal
    const toggleBgRemoval = document.getElementById('toggle-bg-removal');
    const bgColorPickerWrapper = document.getElementById('bg-color-picker-wrapper');
    const colorBtns = document.querySelectorAll('.color-btn');
    const customColorPicker = document.getElementById('custom-color-picker');
    let selectedBgColor = '#FFFFFF';
    
    // Actions
    const btnProcess = document.getElementById('btn-process');
    const processSpinner = document.getElementById('process-spinner');
    const btnChangePhoto = document.getElementById('btn-change-photo');
    const btnEditAgain = document.getElementById('btn-edit-again');
    const btnStartOver = document.getElementById('btn-start-over');
    
    // Export Outputs
    const imgOutputSingle = document.getElementById('img-output-single');
    const imgOutputSheet = document.getElementById('img-output-sheet');
    const metaOutputDim = document.getElementById('meta-output-dim');
    const metaOutputPx = document.getElementById('meta-output-px');
    const btnDownloadSingle = document.getElementById('btn-download-single');
    const btnDownloadSheet = document.getElementById('btn-download-sheet');
    
    // Loading overlay
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');

    // ----------------------------------------------------
    // UPLOAD / DROP EVENTS
    // ----------------------------------------------------
    
    // Click dropzone to browse
    dropZone.addEventListener('click', () => fileInput.click());
    
    // Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        }, false);
    });
    
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    btnUseSample.addEventListener('click', async () => {
        showLoading("Loading sample photo...");
        try {
            const response = await fetch('/static/assets/sample.jpg');
            const blob = await response.blob();
            const file = new File([blob], "sample.jpg", { type: "image/jpeg" });
            handleFileUpload(file);
        } catch (error) {
            hideLoading();
            alert("Error loading sample image: " + error.message);
        }
    });

    // ----------------------------------------------------
    // FILE UPLOAD & DETECTION
    // ----------------------------------------------------
    function handleFileUpload(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file.');
            return;
        }
        
        showLoading("Detecting face and analyzing layout...");
        
        const formData = new FormData();
        formData.append('file', file);
        
        fetch('/api/detect', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) throw new Error("Server error during face detection");
            return response.json();
        })
        .then(data => {
            hideLoading();
            if (data.success) {
                originalImageBase64 = data.image;
                faceData = data.face;
                eyesData = data.eyes;
                recommendations = data.recommendations;
                
                // Switch View
                switchView('view-editor');
                
                // Update face detection status UI
                if (faceData) {
                    faceDetectStatus.className = 'status-indicator success';
                    faceDetectStatus.querySelector('.status-text').textContent = data.aligned ? 'Face & Eyes aligned' : 'Face detected';
                } else {
                    faceDetectStatus.className = 'status-indicator warning';
                    faceDetectStatus.querySelector('.status-text').textContent = 'Manual adjustment required';
                }
                
                // Initialize Cropper
                initCropper();
            } else {
                alert('Detection failed: ' + data.error);
            }
        })
        .catch(err => {
            hideLoading();
            alert('Error uploading file: ' + err.message);
        });
    }

    // ----------------------------------------------------
    // CROPPER INITIALIZATION & SVG GUIDELINES SYNC
    // ----------------------------------------------------
    function initCropper() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        
        imageToCrop.src = originalImageBase64;
        
        // Wait for image to load to initialize
        imageToCrop.onload = () => {
            const spec = getActiveSpec();
            
            cropper = new Cropper(imageToCrop, {
                aspectRatio: spec.aspectRatio,
                viewMode: 1, // Restrict crop box inside canvas
                dragMode: 'move',
                autoCropArea: 0.8,
                background: false, // Transparent wrapper background
                modal: true, // Semi-transparent overlay outside crop box
                guides: false, // Disable default grid guides
                center: false,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
                
                ready() {
                    // Apply recommended crop coordinates if available
                    applyRecommendedCrop();
                    syncOverlay();
                    applyRealtimeFilters();
                },
                
                crop() {
                    syncOverlay();
                }
            });
        };
    }

    // Sync custom SVG guidelines overlay with Cropper's crop box
    function syncOverlay() {
        if (!cropper) return;
        
        const cropBox = cropper.getCropBoxData();
        
        // Position SVG overlay container exactly over the crop box
        guidelinesOverlay.style.left = `${cropBox.left}px`;
        guidelinesOverlay.style.top = `${cropBox.top}px`;
        guidelinesOverlay.style.width = `${cropBox.width}px`;
        guidelinesOverlay.style.height = `${cropBox.height}px`;
    }

    // Apply recommended coordinates from the backend
    function applyRecommendedCrop() {
        if (!cropper) return;
        
        const spec = getActiveSpec();
        const rec = recommendations ? recommendations[currentSpec] : null;
        
        if (rec) {
            // Apply recommended crop coordinates
            cropper.setData({
                x: rec.x,
                y: rec.y,
                width: rec.width,
                height: rec.height
            });
        } else {
            // Center crop fallback
            const canvasData = cropper.getCanvasData();
            const side = Math.min(canvasData.width, canvasData.height) * 0.75;
            const w = side;
            const h = side / spec.aspectRatio;
            cropper.setData({
                x: (canvasData.naturalWidth - w) / 2,
                y: (canvasData.naturalHeight - h) / 2,
                width: w,
                height: h
            });
        }
    }

    // ----------------------------------------------------
    // SPECIFICATION UPDATE (ON DROPDOWN CHANGE & CUSTOM OVERRIDES)
    // ----------------------------------------------------
    function getActiveSpecKey() {
        const country = selectCountry.value;
        const type = document.querySelector('input[name="doc-type"]:checked').value;
        
        if (country === 'us') {
            return type === 'passport' ? 'us_passport' : 'us_visa';
        } else if (country === 'in') {
            return type === 'passport' ? 'in_passport' : 'in_visa';
        } else {
            return 'icao_generic';
        }
    }

    function getActiveSpec() {
        const specKey = getActiveSpecKey();
        const baseSpec = SPECS[specKey];
        
        if (chkOverrideDimensions.checked) {
            const customWidth = parseInt(inputCustomWidth.value) || baseSpec.width;
            const customHeight = parseInt(inputCustomHeight.value) || baseSpec.height;
            const customDpi = parseInt(inputCustomDpi.value) || baseSpec.dpi || 300;
            const customDimText = inputCustomDimText.value.trim() || `${customWidth} x ${customHeight} px`;
            
            return {
                ...baseSpec,
                name: `${baseSpec.name} (Custom)`,
                width: customWidth,
                height: customHeight,
                aspectRatio: customWidth / customHeight,
                dimText: customDimText,
                dpi: customDpi
            };
        }
        return baseSpec;
    }

    function updateActiveSpec() {
        const specKey = getActiveSpecKey();
        currentSpec = specKey;
        const spec = getActiveSpec();
        
        // Update details text
        specName.textContent = spec.name;
        specDim.textContent = `Size: ${spec.dimText}`;
        specRules.textContent = spec.rulesText;
        
        // Update SVG guidelines
        if (spec.overlayId === 'guide-face-oval-us') {
            guideFaceOvalUs.style.display = 'block';
            guideFaceOval.style.display = 'none';
        } else {
            guideFaceOvalUs.style.display = 'none';
            guideFaceOval.style.display = 'block';
        }
        
        guideEyeLine.setAttribute('y1', spec.eyeY);
        guideEyeLine.setAttribute('y2', spec.eyeY);
        guideChinLine.setAttribute('y1', spec.chinY);
        guideChinLine.setAttribute('y2', spec.chinY);
        
        if (cropper) {
            // Update aspect ratio
            cropper.setAspectRatio(spec.aspectRatio);
            // Apply recommended crop coordinates for new specification
            applyRecommendedCrop();
            syncOverlay();
        }
    }

    function handlePresetChange() {
        if (chkOverrideDimensions.checked) {
            const specKey = getActiveSpecKey();
            const baseSpec = SPECS[specKey];
            inputCustomWidth.value = baseSpec.width;
            inputCustomHeight.value = baseSpec.height;
            inputCustomDpi.value = baseSpec.dpi || 300;
            inputCustomDimText.value = baseSpec.dimText;
        }
        updateActiveSpec();
    }

    // Toggle Override Checkbox
    chkOverrideDimensions.addEventListener('change', (e) => {
        const specKey = getActiveSpecKey();
        const baseSpec = SPECS[specKey];
        
        if (e.target.checked) {
            overrideInputsContainer.classList.remove('collapsed');
            if (!inputCustomWidth.value) inputCustomWidth.value = baseSpec.width;
            if (!inputCustomHeight.value) inputCustomHeight.value = baseSpec.height;
            if (!inputCustomDpi.value) inputCustomDpi.value = baseSpec.dpi || 300;
            if (!inputCustomDimText.value) inputCustomDimText.value = baseSpec.dimText;
        } else {
            overrideInputsContainer.classList.add('collapsed');
        }
        updateActiveSpec();
    });

    // Handle inputs for custom dimensions
    [inputCustomWidth, inputCustomHeight, inputCustomDpi, inputCustomDimText].forEach(input => {
        input.addEventListener('input', updateActiveSpec);
    });

    // Dropdown change events
    selectCountry.addEventListener('change', handlePresetChange);
    typePassport.addEventListener('change', handlePresetChange);
    typeVisa.addEventListener('change', handlePresetChange);

    // ----------------------------------------------------
    // IMAGE ADJUSTMENTS (REALTIME FILTERS)
    // ----------------------------------------------------
    function applyRealtimeFilters() {
        if (!cropper) return;
        
        const brightness = sliderBrightness.value;
        const contrast = sliderContrast.value;
        const saturation = sliderSaturation.value;
        const rotation = sliderRotation.value;
        
        // Apply filters in CSS to the cropper image view canvas for instant feedback
        const cropperCanvasImg = document.querySelector('.cropper-canvas img');
        const cropperViewBoxImg = document.querySelector('.cropper-view-box img');
        
        const filterStr = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
        
        if (cropperCanvasImg) cropperCanvasImg.style.filter = filterStr;
        if (cropperViewBoxImg) cropperViewBoxImg.style.filter = filterStr;
        
        // Handle rotation inside cropper
        cropper.rotateTo(rotation);
    }

    // Listeners for sliders
    sliderBrightness.addEventListener('input', (e) => {
        valBrightness.textContent = `${Math.round(e.target.value * 100)}%`;
        applyRealtimeFilters();
    });
    
    sliderContrast.addEventListener('input', (e) => {
        valContrast.textContent = `${Math.round(e.target.value * 100)}%`;
        applyRealtimeFilters();
    });
    
    sliderSaturation.addEventListener('input', (e) => {
        valSaturation.textContent = `${Math.round(e.target.value * 100)}%`;
        applyRealtimeFilters();
    });
    
    sliderRotation.addEventListener('input', (e) => {
        valRotation.textContent = `${e.target.value}°`;
        applyRealtimeFilters();
    });

    // ----------------------------------------------------
    // BACKGROUND REMOVAL CONTROLS
    // ----------------------------------------------------
    toggleBgRemoval.addEventListener('change', (e) => {
        if (e.target.checked) {
            bgColorPickerWrapper.classList.remove('disabled');
        } else {
            bgColorPickerWrapper.classList.add('disabled');
        }
    });

    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            colorBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedBgColor = btn.getAttribute('data-color');
        });
    });

    customColorPicker.addEventListener('input', (e) => {
        colorBtns.forEach(b => b.classList.remove('active'));
        selectedBgColor = e.target.value;
    });

    // ----------------------------------------------------
    // GENERATE PASSPORT PHOTO (API PROCESS CALL)
    // ----------------------------------------------------
    btnProcess.addEventListener('click', () => {
        if (!cropper) return;
        
        // Show spinner inside button and overlay
        btnProcess.disabled = true;
        processSpinner.style.display = 'inline-flex';
        showLoading("Processing photo and applying rules...");
        
        const cropData = cropper.getData(true); // Get crop data rounded to integers
        const spec = SPECS[currentSpec];
        
        const requestData = {
            image: originalImageBase64,
            crop_x: cropData.x,
            crop_y: cropData.y,
            crop_width: cropData.width,
            crop_height: cropData.height,
            brightness: parseFloat(sliderBrightness.value),
            contrast: parseFloat(sliderContrast.value),
            saturation: parseFloat(sliderSaturation.value),
            rotation: parseFloat(sliderRotation.value),
            remove_background: toggleBgRemoval.checked,
            bg_color: selectedBgColor,
            target_w: spec.width,
            target_h: spec.height,
            face_rect: faceData
        };
        
        fetch('/api/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        })
        .then(response => {
            if (!response.ok) throw new Error("Failed to process photo");
            return response.json();
        })
        .then(data => {
            hideLoading();
            btnProcess.disabled = false;
            processSpinner.style.display = 'none';
            
            if (data.success) {
                // Populate Export View
                imgOutputSingle.src = data.processed_image;
                imgOutputSheet.src = data.print_sheet;
                
                // Update text
                metaOutputDim.textContent = spec.dimText;
                metaOutputPx.textContent = `${spec.width} x ${spec.height} px (${spec.dpi || 300} DPI)`;
                
                // Downloads Setup
                btnDownloadSingle.dataset.url = data.processed_image;
                btnDownloadSingle.dataset.filename = `${currentSpec}_photo.jpg`;
                btnDownloadSheet.dataset.url = data.print_sheet;
                btnDownloadSheet.dataset.filename = `${currentSpec}_print_sheet.jpg`;
                
                // Switch View
                switchView('view-export');
            } else {
                alert('Processing failed: ' + data.error);
            }
        })
        .catch(err => {
            hideLoading();
            btnProcess.disabled = false;
            processSpinner.style.display = 'none';
            alert('Error generating passport photo: ' + err.message);
        });
    });

    function triggerDownload(btn) {
        const url = btn.dataset.url;
        const filename = btn.dataset.filename;
        if (url) {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    btnDownloadSingle.addEventListener('click', () => triggerDownload(btnDownloadSingle));
    btnDownloadSheet.addEventListener('click', () => triggerDownload(btnDownloadSheet));

    // Navigation and Back buttons
    btnChangePhoto.addEventListener('click', () => {
        if (confirm("Discard changes and upload a different image?")) {
            resetEditorState();
            switchView('view-upload');
        }
    });

    btnEditAgain.addEventListener('click', () => {
        switchView('view-editor');
        // Destroy and re-init cropper to ensure it renders correctly
        setTimeout(initCropper, 100);
    });

    btnStartOver.addEventListener('click', () => {
        resetEditorState();
        switchView('view-upload');
    });

    // ----------------------------------------------------
    // HELPER FUNCTIONS
    // ----------------------------------------------------
    function switchView(viewId) {
        [viewUpload, viewEditor, viewExport].forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById(viewId).classList.add('active');
        window.scrollTo(0, 0);
    }
    
    function resetEditorState() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        originalImageBase64 = null;
        faceData = null;
        eyesData = null;
        recommendations = null;
        fileInput.value = '';
        
        // Reset Sliders
        sliderBrightness.value = 1.0;
        sliderContrast.value = 1.0;
        sliderSaturation.value = 1.0;
        sliderRotation.value = 0;
        
        valBrightness.textContent = '100%';
        valContrast.textContent = '100%';
        valSaturation.textContent = '100%';
        valRotation.textContent = '0°';
        
        // Reset BG Removal
        toggleBgRemoval.checked = false;
        bgColorPickerWrapper.classList.add('disabled');
        colorBtns.forEach(b => b.classList.remove('active'));
        colorBtns[0].classList.add('active');
        selectedBgColor = '#FFFFFF';
        
        // Reset Overrides
        chkOverrideDimensions.checked = false;
        overrideInputsContainer.classList.add('collapsed');
        inputCustomWidth.value = '';
        inputCustomHeight.value = '';
        inputCustomDpi.value = '';
        inputCustomDimText.value = '';
    }

    function showLoading(msg) {
        loadingMessage.textContent = msg;
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }

    // Trigger Active Specification init
    updateActiveSpec();
});

import io
import math
import base64
import numpy as np
import cv2
from PIL import Image, ImageEnhance, ImageDraw
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict

app = FastAPI(title="ICAO Passport Photo Converter")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

@app.get("/")
def read_index():
    return FileResponse("static/index.html")

def detect_and_align_face(image_bytes: bytes):
    # Decode image from bytes
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
        
    h, w = img.shape[:2]
    
    # Downscale for processing if too large to keep it fast
    max_process_dim = 1200
    if max(h, w) > max_process_dim:
        scale = max_process_dim / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Load face and eye cascades
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml')
    eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye_tree_eyeglasses.xml')
    
    # Detect faces
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(80, 80))
    
    if len(faces) == 0:
        # Try default frontal face cascade if alt2 fails
        face_cascade_default = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        faces = face_cascade_default.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(80, 80))
        
    if len(faces) == 0:
        return img, None, None, False
        
    # Select largest face
    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    fx, fy, fw, fh = faces[0]
    
    # Detect eyes inside the face region
    face_gray = gray[fy:fy+fh, fx:fx+fw]
    detected_eyes = eye_cascade.detectMultiScale(face_gray, scaleFactor=1.05, minNeighbors=3, minSize=(15, 15))
    
    # Filter eyes
    left_eye_candidates = [] # viewer's left (person's right)
    right_eye_candidates = [] # viewer's right (person's left)
    
    for (ex, ey, ew, eh) in detected_eyes:
        ecx = ex + ew / 2.0
        ecy = ey + eh / 2.0
        
        # Eyes should be in the upper half of face and not too close to the top
        if 0.20 * fh < ecy < 0.55 * fh:
            if ecx < 0.5 * fw:
                left_eye_candidates.append((fx + ecx, fy + ecy))
            else:
                right_eye_candidates.append((fx + ecx, fy + ecy))
                
    expected_eye_y = fy + 0.35 * fh
    
    left_eye = None
    right_eye = None
    
    if left_eye_candidates:
        left_eye = min(left_eye_candidates, key=lambda p: abs(p[1] - expected_eye_y))
    if right_eye_candidates:
        right_eye = min(right_eye_candidates, key=lambda p: abs(p[1] - expected_eye_y))
        
    # Align face if both eyes are found
    aligned = False
    aligned_img = img.copy()
    
    if left_eye and right_eye:
        lx, ly = left_eye
        rx, ry = right_eye
        dy = ry - ly
        dx = rx - lx
        angle_rad = math.atan2(dy, dx)
        angle_deg = math.degrees(angle_rad)
        
        # Center of rotation is midpoint between eyes
        eye_midpoint = ((lx + rx) / 2.0, (ly + ry) / 2.0)
        
        # Rotate image
        M = cv2.getRotationMatrix2D(eye_midpoint, angle_deg, 1.0)
        aligned_img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
        aligned = True
        
        # Re-detect face in rotated image for precision
        gray_aligned = cv2.cvtColor(aligned_img, cv2.COLOR_BGR2GRAY)
        faces_aligned = face_cascade.detectMultiScale(gray_aligned, scaleFactor=1.1, minNeighbors=4, minSize=(80, 80))
        if len(faces_aligned) > 0:
            faces_aligned = sorted(faces_aligned, key=lambda f: f[2] * f[3], reverse=True)
            fx, fy, fw, fh = faces_aligned[0]
            
            # Recalculate eyes in the aligned image
            face_gray_aligned = gray_aligned[fy:fy+fh, fx:fx+fw]
            detected_eyes_aligned = eye_cascade.detectMultiScale(face_gray_aligned, scaleFactor=1.05, minNeighbors=3, minSize=(15, 15))
            
            left_eye_candidates_aligned = []
            right_eye_candidates_aligned = []
            for (ex, ey, ew, eh) in detected_eyes_aligned:
                ecx = ex + ew / 2.0
                ecy = ey + eh / 2.0
                if 0.20 * fh < ecy < 0.55 * fh:
                    if ecx < 0.5 * fw:
                        left_eye_candidates_aligned.append((fx + ecx, fy + ecy))
                    else:
                        right_eye_candidates_aligned.append((fx + ecx, fy + ecy))
                        
            if left_eye_candidates_aligned:
                left_eye = min(left_eye_candidates_aligned, key=lambda p: abs(p[1] - (fy + 0.35 * fh)))
            else:
                left_eye = (fx + fw * 0.35, fy + fh * 0.35)
                
            if right_eye_candidates_aligned:
                right_eye = min(right_eye_candidates_aligned, key=lambda p: abs(p[1] - (fy + 0.35 * fh)))
            else:
                right_eye = (fx + fw * 0.65, fy + fh * 0.35)
        
    if not left_eye and not right_eye and (fw > 0):
        left_eye = (fx + fw * 0.35, fy + fh * 0.35)
        right_eye = (fx + fw * 0.65, fy + fh * 0.35)
        
    face_data = {
        "x": int(fx),
        "y": int(fy),
        "w": int(fw),
        "h": int(fh)
    }
    
    eyes_data = [
        {"x": int(left_eye[0]), "y": int(left_eye[1])},
        {"x": int(right_eye[0]), "y": int(right_eye[1])}
    ]
    
    return aligned_img, face_data, eyes_data, aligned

def img_to_base64(img_bgr_or_rgb, is_bgr=True):
    if is_bgr:
        img_rgb = cv2.cvtColor(img_bgr_or_rgb, cv2.COLOR_BGR2RGB)
    else:
        img_rgb = img_bgr_or_rgb
        
    pil_img = Image.fromarray(img_rgb)
    buffered = io.BytesIO()
    pil_img.save(buffered, format="JPEG", quality=95)
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{img_str}"

def remove_background_optimized_mask(img, face_rect=None):
    h, w = img.shape[:2]
    
    # Downscale for speed
    max_dim = 400
    scale = 1.0
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img_small = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    else:
        img_small = img.copy()
        
    h_s, w_s = img_small.shape[:2]
    
    # Initialize mask with probable background (GC_PR_BGD = 2)
    mask = np.full((h_s, w_s), cv2.GC_PR_BGD, dtype=np.uint8)
    
    # Definite background at the margins (left, right, top 5% width/height)
    margin_w = max(1, int(w_s * 0.05))
    margin_h = max(1, int(h_s * 0.05))
    mask[0:margin_h, :] = cv2.GC_BGD
    mask[:, 0:margin_w] = cv2.GC_BGD
    mask[:, w_s - margin_w:] = cv2.GC_BGD
    
    # If we have a face rect, set probable foreground and definite foreground
    if face_rect:
        fx, fy, fw, fh = face_rect["x"], face_rect["y"], face_rect["w"], face_rect["h"]
        fx_s = int(fx * scale)
        fy_s = int(fy * scale)
        fw_s = int(fw * scale)
        fh_s = int(fh * scale)
        
        # Center of face is definite foreground (GC_FGD = 1)
        center_x = fx_s + fw_s // 2
        center_y = fy_s + fh_s // 2
        axes = (fw_s // 3, fh_s // 2)
        cv2.ellipse(mask, (center_x, center_y), axes, 0, 0, 360, cv2.GC_FGD, -1)
        
        # Probable foreground for the rest of the body (head and shoulders)
        x1 = max(0, int(fx_s - fw_s * 0.4))
        y1 = max(0, int(fy_s - fh_s * 0.3))
        x2 = min(w_s, int(fx_s + fw_s * 1.4))
        y2 = h_s
        
        body_mask = np.zeros((h_s, w_s), dtype=np.uint8)
        cv2.rectangle(body_mask, (x1, y1), (x2, y2), 1, -1)
        mask[(body_mask == 1) & (mask != cv2.GC_BGD) & (mask != cv2.GC_FGD)] = cv2.GC_PR_FGD
    else:
        # Default probable foreground in the center
        x1, y1 = int(w_s * 0.2), int(h_s * 0.1)
        x2, y2 = int(w_s * 0.8), h_s
        cv2.rectangle(mask, (x1, y1), (x2, y2), cv2.GC_PR_FGD, -1)
        cv2.rectangle(mask, (int(w_s * 0.3), int(h_s * 0.2)), (int(w_s * 0.7), int(h_s * 0.8)), cv2.GC_FGD, -1)
        
    bgdModel = np.zeros((1, 65), np.float64)
    fgdModel = np.zeros((1, 65), np.float64)
    
    try:
        cv2.grabCut(img_small, mask, None, bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_MASK)
        mask_small = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype('uint8')
    except Exception as e:
        print("GrabCut error:", e)
        # Fallback: simple center rectangle
        mask_small = np.zeros((h_s, w_s), np.uint8)
        cv2.rectangle(mask_small, (int(w_s*0.2), int(h_s*0.1)), (int(w_s*0.8), h_s), 255, -1)
        
    # Resize mask back to original resolution
    mask_large = cv2.resize(mask_small, (w, h), interpolation=cv2.INTER_LINEAR)
    mask_large = cv2.GaussianBlur(mask_large, (5, 5), 0)
    
    return mask_large

def generate_print_sheet(photo_img: Image.Image, canvas_width=1200, canvas_height=1800):
    canvas = Image.new("RGB", (canvas_width, canvas_height), "white")
    pw, ph = photo_img.size
    
    cols = canvas_width // pw
    rows = canvas_height // ph
    
    if cols == 0 or rows == 0:
        photo_img = photo_img.resize((canvas_width // 2, canvas_height // 2), Image.Resampling.LANCZOS)
        pw, ph = photo_img.size
        cols = 2
        rows = 2
        
    grid_w = cols * pw
    grid_h = rows * ph
    
    start_x = (canvas_width - grid_w) // 2
    start_y = (canvas_height - grid_h) // 2
    
    draw = ImageDraw.Draw(canvas)
    
    for r in range(rows):
        for c in range(cols):
            x = start_x + c * pw
            y = start_y + r * ph
            canvas.paste(photo_img, (x, y))
            draw.rectangle([x, y, x + pw - 1, y + ph - 1], outline=(200, 200, 200), width=1)
            
    return canvas

@app.post("/api/detect")
async def detect_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        aligned_img, face, eyes, aligned = detect_and_align_face(contents)
        aligned_img_base64 = img_to_base64(aligned_img)
        
        # Default crop fallback
        h, w = aligned_img.shape[:2]
        side = min(w, h)
        default_crop = {"x": (w - side) / 2, "y": (h - side) / 2, "width": side, "height": side}
        
        recommendations = {
            "us_passport": default_crop,
            "us_visa": default_crop,
            "in_passport": {"x": (w - side*35/45)/2, "y": (h - side)/2, "width": side*35/45, "height": side},
            "in_visa": default_crop,
            "icao_generic": {"x": (w - side*35/45)/2, "y": (h - side)/2, "width": side*35/45, "height": side}
        }
        
        if face:
            fx, fy, fw, fh = face["x"], face["y"], face["w"], face["h"]
            eye_y = (eyes[0]["y"] + eyes[1]["y"]) / 2.0 if len(eyes) == 2 else fy + fh * 0.35
            
            # US Passport/Visa (2"x2" = 600x600 px, face ~60%, eye ~38% from top)
            us_crop_h = fh / 0.60
            us_crop_w = us_crop_h
            us_crop_x = (fx + fw/2.0) - us_crop_w/2.0
            us_crop_y = eye_y - 0.38 * us_crop_h
            
            # India Passport (swapped to 35x45 mm = 413x531 px, ratio 35:45, face ~75%, eye ~40% from top)
            in_pass_h = fh / 0.75
            in_pass_w = in_pass_h * (35.0 / 45.0)
            in_pass_x = (fx + fw/2.0) - in_pass_w/2.0
            in_pass_y = eye_y - 0.40 * in_pass_h
            
            # India Visa (swapped to 2"x2" = 600x600 px, face ~75%, eye ~42% from top)
            in_visa_h = fh / 0.75
            in_visa_w = in_visa_h
            in_visa_x = (fx + fw/2.0) - in_visa_w/2.0
            in_visa_y = eye_y - 0.42 * in_visa_h
            
            recommendations = {
                "us_passport": {"x": us_crop_x, "y": us_crop_y, "width": us_crop_w, "height": us_crop_h},
                "us_visa": {"x": us_crop_x, "y": us_crop_y, "width": us_crop_w, "height": us_crop_h},
                "in_passport": {"x": in_pass_x, "y": in_pass_y, "width": in_pass_w, "height": in_pass_h},
                "in_visa": {"x": in_visa_x, "y": in_visa_y, "width": in_visa_w, "height": in_visa_h},
                "icao_generic": {"x": in_pass_x, "y": in_pass_y, "width": in_pass_w, "height": in_pass_h}
            }
            
        return JSONResponse({
            "success": True,
            "aligned": aligned,
            "face": face,
            "eyes": eyes,
            "image": aligned_img_base64,
            "recommendations": recommendations
        })
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)

class ProcessRequest(BaseModel):
    image: str
    crop_x: float
    crop_y: float
    crop_width: float
    crop_height: float
    brightness: float = 1.0
    contrast: float = 1.0
    saturation: float = 1.0
    rotation: float = 0.0
    remove_background: bool = False
    bg_color: str = "#FFFFFF"
    target_w: int = 600
    target_h: int = 600
    face_rect: Optional[Dict[str, float]] = None

@app.post("/api/process")
def process_image(request: ProcessRequest):
    try:
        if "," in request.image:
            header, encoded = request.image.split(",", 1)
        else:
            encoded = request.image
            
        image_data = base64.b64decode(encoded)
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image")
            
        img_h, img_w = img.shape[:2]
        
        # 1. Fine Rotation
        if request.rotation != 0.0:
            center = (img_w / 2.0, img_h / 2.0)
            M = cv2.getRotationMatrix2D(center, -request.rotation, 1.0) # match PIL clockwise rotation direction
            img = cv2.warpAffine(img, M, (img_w, img_h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
            
        # 2. Brightness, Contrast, Saturation (via PIL)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(img_rgb)
        
        if request.brightness != 1.0:
            pil_img = ImageEnhance.Brightness(pil_img).enhance(request.brightness)
        if request.contrast != 1.0:
            pil_img = ImageEnhance.Contrast(pil_img).enhance(request.contrast)
        if request.saturation != 1.0:
            pil_img = ImageEnhance.Color(pil_img).enhance(request.saturation)
            
        img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        
        # 3. Background removal
        if request.remove_background:
            hex_color = request.bg_color.lstrip('#')
            bg_r = int(hex_color[0:2], 16)
            bg_g = int(hex_color[2:4], 16)
            bg_b = int(hex_color[4:6], 16)
            bgr_bg_color = (bg_b, bg_g, bg_r)
            
            mask = remove_background_optimized_mask(img, request.face_rect)
            
            alpha = mask.astype(float) / 255.0
            alpha = np.expand_dims(alpha, axis=2)
            
            bg = np.zeros_like(img)
            bg[:] = bgr_bg_color
            
            img = (img.astype(float) * alpha + bg.astype(float) * (1.0 - alpha)).astype(np.uint8)
            
        # 4. Cropping
        x = int(request.crop_x)
        y = int(request.crop_y)
        cw = int(request.crop_width)
        ch = int(request.crop_height)
        
        if cw <= 0 or ch <= 0:
            raise HTTPException(status_code=400, detail="Invalid crop dimensions")
            
        # Handle out of bounds cropping gracefully
        pad_left = max(0, -x)
        pad_top = max(0, -y)
        pad_right = max(0, (x + cw) - img_w)
        pad_bottom = max(0, (y + ch) - img_h)
        
        if pad_left > 0 or pad_top > 0 or pad_right > 0 or pad_bottom > 0:
            if request.remove_background:
                hex_color = request.bg_color.lstrip('#')
                bg_r = int(hex_color[0:2], 16)
                bg_g = int(hex_color[2:4], 16)
                bg_b = int(hex_color[4:6], 16)
                pad_val = [bg_b, bg_g, bg_r]
                img_padded = cv2.copyMakeBorder(img, pad_top, pad_bottom, pad_left, pad_right, cv2.BORDER_CONSTANT, value=pad_val)
            else:
                img_padded = cv2.copyMakeBorder(img, pad_top, pad_bottom, pad_left, pad_right, cv2.BORDER_REPLICATE)
                
            crop_x_shifted = x + pad_left
            crop_y_shifted = y + pad_top
            cropped = img_padded[crop_y_shifted:crop_y_shifted+ch, crop_x_shifted:crop_x_shifted+cw]
        else:
            cropped = img[y:y+ch, x:x+cw]
            
        # 5. Resize to output standard
        cropped_resized = cv2.resize(cropped, (request.target_w, request.target_h), interpolation=cv2.INTER_LANCZOS4)
        
        # 6. Generate 4x6 Printable Sheet
        cropped_rgb = cv2.cvtColor(cropped_resized, cv2.COLOR_BGR2RGB)
        pil_cropped = Image.fromarray(cropped_rgb)
        
        pil_sheet = generate_print_sheet(pil_cropped, canvas_width=1200, canvas_height=1800)
        
        # 7. Encode results to base64
        processed_img_base64 = img_to_base64(cropped_rgb, is_bgr=False)
        
        buffered_sheet = io.BytesIO()
        pil_sheet.save(buffered_sheet, format="JPEG", quality=90)
        sheet_str = base64.b64encode(buffered_sheet.getvalue()).decode("utf-8")
        print_sheet_base64 = f"data:image/jpeg;base64,{sheet_str}"
        
        return JSONResponse({
            "success": True,
            "processed_image": processed_img_base64,
            "print_sheet": print_sheet_base64
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)

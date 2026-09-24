export function loadImageFile(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Image could not be read.")); };
    img.src = url;
  });
}
// Downscale without cropping (chapter images): longest edge maxEdge, JPEG.
export function freeResize(file, maxEdge = 1200) {
  return loadImageFile(file).then((img) => new Promise((res, rej) => {
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);
    canvas.toBlob((blob) => blob ? res(blob) : rej(new Error("Image conversion failed.")), "image/jpeg", 0.85);
  }));
}

// Square crop editor on a canvas: the image covers the square, the user pans
// it by dragging and adjusts the zoom with a range input. cropToBlob() renders exactly the
// visible square at `size` px as JPEG.
export function makeCropper(canvas, img, zoomInput) {
  const S = canvas.width;
  const base = S / Math.min(img.naturalWidth, img.naturalHeight); // cover
  let zoom = 1, cx = img.naturalWidth / 2, cy = img.naturalHeight / 2; // image-space center of the square
  const scale = () => base * zoom;
  const clamp = () => {
    const half = S / 2 / scale();
    cx = Math.min(Math.max(cx, half), img.naturalWidth - half);
    cy = Math.min(Math.max(cy, half), img.naturalHeight - half);
  };
  const draw = (ctx = canvas.getContext("2d"), size = S) => {
    const k = size / S, sc = scale() * k;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, size / 2 - cx * sc, size / 2 - cy * sc, img.naturalWidth * sc, img.naturalHeight * sc);
  };
  clamp(); draw();
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = canvas.getBoundingClientRect(), css = S / r.width; // canvas px per CSS px
    cx -= (e.clientX - drag.x) * css / scale();
    cy -= (e.clientY - drag.y) * css / scale();
    drag = { x: e.clientX, y: e.clientY };
    clamp(); draw();
  });
  const end = () => { drag = null; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  zoomInput?.addEventListener("input", () => { zoom = Number(zoomInput.value) || 1; clamp(); draw(); });
  return {
    cropToBlob(size = 800) {
      const out = document.createElement("canvas");
      out.width = size; out.height = size;
      draw(out.getContext("2d"), size);
      return new Promise((res, rej) => out.toBlob((blob) => blob ? res(blob) : rej(new Error("Image conversion failed.")), "image/jpeg", 0.85));
    }
  };
}

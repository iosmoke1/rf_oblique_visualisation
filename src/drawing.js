function setupDrawing(canvas, options) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  clearCanvas(canvas);
  let isDrawing = false;

  function getPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((event.clientY - rect.top) * canvas.height) / rect.height;
    return { x, y };
  }

  function stop() {
    isDrawing = false;
    ctx.beginPath();
  }

  function paint(event) {
    if (!isDrawing) {
      return;
    }
    event.preventDefault();

    const point = getPoint(event);
    ctx.lineWidth = options.brushSize();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = options.eraser() ? '#ffffff' : '#111111';
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  canvas.addEventListener('pointerdown', (event) => {
    isDrawing = true;
    const point = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    paint(event);
  });
  canvas.addEventListener('pointermove', paint);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointerleave', stop);
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPrediction(canvas, model) {
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);

  for (let y = 0; y < CANVAS_SIZE; y += 1) {
    for (let x = 0; x < CANVAS_SIZE; x += 1) {
      const score = model.predictScore(x / (CANVAS_SIZE - 1), y / (CANVAS_SIZE - 1));
      const color = score >= 0.5 ? 17 : 255;
      const i = (y * CANVAS_SIZE + x) * 4;

      image.data[i] = color;
      image.data[i + 1] = color;
      image.data[i + 2] = color;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
}

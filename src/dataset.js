const CANVAS_SIZE = 256;

function makeDataset(canvas, trainRatio) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const pixels = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
  const positives = [];
  const negatives = [];

  for (let y = 0; y < CANVAS_SIZE; y += 1) {
    for (let x = 0; x < CANVAS_SIZE; x += 1) {
      const i = (y * CANVAS_SIZE + x) * 4;
      const label = 255 - pixels[i] > 35 ? 1 : 0;
      const row = { x: x / (CANVAS_SIZE - 1), y: y / (CANVAS_SIZE - 1), label };

      if (label) {
        positives.push(row);
      } else {
        negatives.push(row);
      }
    }
  }

  if (positives.length < 30) {
    return { error: 'Слишком мало нарисованных точек' };
  }
  if (negatives.length < 30) {
    return { error: 'Оставьте немного пустого фона — сейчас холст закрашен почти целиком' };
  }

  shuffle(positives);
  shuffle(negatives);

  const sampleSize = Math.min(positives.length, negatives.length, 6500);
  const rows = shuffle([...positives.slice(0, sampleSize), ...negatives.slice(0, sampleSize)]);
  const trainSize = Math.floor(rows.length * trainRatio);

  return { train: rows.slice(0, trainSize), test: rows.slice(trainSize) };
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function getMetrics(rows) {
  const confusion = { tp: 0, tn: 0, fp: 0, fn: 0 };

  for (const row of rows) {
    const prediction = row.score >= 0.5 ? 1 : 0;

    if (row.y === 1 && prediction === 1) {
      confusion.tp += 1;
    }
    if (row.y === 0 && prediction === 0) {
      confusion.tn += 1;
    }
    if (row.y === 0 && prediction === 1) {
      confusion.fp += 1;
    }
    if (row.y === 1 && prediction === 0) {
      confusion.fn += 1;
    }
  }

  const total = confusion.tp + confusion.tn + confusion.fp + confusion.fn || 1;
  const precision = confusion.tp / (confusion.tp + confusion.fp || 1);
  const recall = confusion.tp / (confusion.tp + confusion.fn || 1);
  const f1 = (2 * precision * recall) / (precision + recall || 1);

  return {
    accuracy: (confusion.tp + confusion.tn) / total,
    precision,
    recall,
    f1,
    confusion,
  };
}

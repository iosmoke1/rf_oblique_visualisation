const $ = (id) => document.querySelector(id);

const ui = {
  canvas: $('#drawCanvas'),
  train: $('#trainBtn'),
  clear: $('#clearBtn'),
  results: $('#results'),
  msg: $('#message'),
  tpl: $('#modelCardTemplate'),
  trainRatio: $('#trainRatio'),
  maxDepth: $('#maxDepth'),
  minLeaf: $('#minLeaf'),
  bootstrap: $('#bootstrapRatio'),
  treeCount: $('#treeCount'),
  directions: $('#directionCount'),
  brush: $('#brushSize'),
  eraser: $('#eraser'),
  treeModel: $('#treeModel'),
  treeNumber: $('#treeNumber'),
  treeViewport: $('#treeViewport'),
};

const out = {
  trainRatio: $('#trainRatioValue'),
  maxDepth: $('#maxDepthValue'),
  minLeaf: $('#minLeafValue'),
  bootstrap: $('#bootstrapValue'),
  treeCount: $('#treeCountValue'),
  directions: $('#directionCountValue'),
  brush: $('#brushSizeValue'),
};

const modelSpecs = [
  {
    id: 'tree',
    title: 'Decision Tree',
    badge: 'обычное дерево',
    create: (settings) => new DecisionTree({
      maxDepth: settings.maxDepth,
      minLeaf: settings.minLeaf,
      randomThresholds: 24,
    }),
  },
  {
    id: 'forest',
    title: 'Random Forest',
    badge: 'лес обычных деревьев',
    create: (settings) => new RandomForest({
      treeCount: settings.treeCount,
      bootstrapRatio: settings.bootstrapRatio,
      treeOptions: {
        maxDepth: settings.maxDepth,
        minLeaf: settings.minLeaf,
        directionsPerSplit: 1,
        randomThresholds: 18,
      },
    }),
  },
  {
    id: 'oblique',
    title: 'Oblique Tree',
    badge: 'косые разбиения',
    create: (settings) => new DecisionTree({
      maxDepth: settings.maxDepth,
      minLeaf: settings.minLeaf,
      oblique: true,
      directionCount: settings.directionCount,
      randomThresholds: 18,
    }),
  },
  {
    id: 'obliqueForest',
    title: 'Oblique Forest',
    badge: 'лес косых деревьев',
    create: (settings) => new RandomForest({
      treeCount: settings.treeCount,
      bootstrapRatio: settings.bootstrapRatio,
      treeOptions: {
        maxDepth: settings.maxDepth,
        minLeaf: settings.minLeaf,
        oblique: true,
        directionCount: settings.directionCount,
        directionsPerSplit: Math.max(2, Math.round(Math.sqrt(settings.directionCount))),
        randomThresholds: 14,
      },
    }),
  },
];

setupDrawing(ui.canvas, {
  brushSize: () => Number(ui.brush.value),
  eraser: () => ui.eraser.checked,
});

renderModelCards();
syncLabels();
const treeView = setupTreeView(ui);

for (const input of document.querySelectorAll("input[type='range']")) {
  input.addEventListener('input', syncLabels);
}

ui.clear.addEventListener('click', () => {
  clearCanvas(ui.canvas);
  clearResults();
  treeView.clear();
  hideMessage();
});

ui.train.addEventListener('click', async () => {
  ui.train.disabled = true;
  treeView.clear();
  hideMessage();

  try {
    await waitFrame();
    const settings = readSettings();
    const dataset = makeDataset(ui.canvas, settings.trainRatio);

    if (dataset.error) {
      showMessage(dataset.error);
      return;
    }

    const models = {};
    for (const spec of modelSpecs) {
      await waitFrame();
      const model = spec.create(settings).fit(dataset.train);
      models[spec.id] = model;
      const card = ui.results.querySelector(`[data-model="${spec.id}"]`);

      drawPrediction(card.querySelector('canvas'), model);
      renderMetrics(
        card,
        evaluate(model, dataset.train),
        evaluate(model, dataset.test),
      );
    }
    treeView.setModels(models);
  } catch (error) {
    showMessage('Что-то пошло не так при обучении. Очистьте холст или снизьте глубину/число деревьев');
    console.error(error);
  } finally {
    ui.train.disabled = false;
  }
});

function readSettings() {
  return {
    trainRatio: Number(ui.trainRatio.value) / 100,
    maxDepth: Number(ui.maxDepth.value),
    minLeaf: Number(ui.minLeaf.value),
    bootstrapRatio: Number(ui.bootstrap.value) / 100,
    treeCount: Number(ui.treeCount.value),
    directionCount: Number(ui.directions.value),
  };
}

function syncLabels() {
  out.trainRatio.textContent = `${ui.trainRatio.value}%`;
  out.maxDepth.textContent = ui.maxDepth.value;
  out.minLeaf.textContent = ui.minLeaf.value;
  out.bootstrap.textContent = `${ui.bootstrap.value}%`;
  out.treeCount.textContent = ui.treeCount.value;
  out.directions.textContent = ui.directions.value;
  out.brush.textContent = ui.brush.value;
}

function renderModelCards() {
  ui.results.innerHTML = '';

  for (const spec of modelSpecs) {
    const fragment = ui.tpl.content.cloneNode(true);
    const card = fragment.querySelector('.model-card');

    card.dataset.model = spec.id;
    card.querySelector('h2').textContent = spec.title;
    card.querySelector('.badge').textContent = spec.badge;
    card.querySelector('.badge').title = modelHint(spec.id);
    clearCanvas(card.querySelector('.prediction canvas'));
    ui.results.appendChild(fragment);
  }
}

function modelHint(id) {
  const hints = {
    tree: 'Деления вида x < c или y < c',
    forest: 'Усредняет много деревьев',
    oblique: 'Деления вида a*x + b*y < c',
    obliqueForest: 'Наклонные разбиения и усреднение',
  };

  return hints[id] || '';
}

function clearResults() {
  for (const canvas of ui.results.querySelectorAll('.prediction canvas:not(.prediction-overlay)')) {
    clearCanvas(canvas);
  }

  for (const block of ui.results.querySelectorAll('.metrics')) {
    block.innerHTML = '';
  }

  for (const cell of ui.results.querySelectorAll('[data-cell]')) {
    cell.textContent = '';
  }
}

function evaluate(model, rows) {
  const predictions = rows.map((row) => ({
    y: row.label,
    score: model.predictScore(row.x, row.y),
  }));

  return getMetrics(predictions);
}

function renderMetrics(card, trainMetrics, testMetrics) {
  const items = [
    ['Train accuracy', trainMetrics.accuracy, 'Доля верных ответов на обучающей выборке'],
    ['Test accuracy', testMetrics.accuracy, 'Доля верных ответов на тестовой выборке'],
    ['Precision', testMetrics.precision, 'Доля верно закрашенных точек среди всех, нарисованных моделью'],
    ['Recall', testMetrics.recall, 'Доля покрытой части рисунка моделью'],
    ['F-мера', testMetrics.f1, 'Среднее гармоническое precision и recall. Учитывает и лишние, и пропущенные точки'],
  ];

  const metricsHtml = items
    .map(([name, value, hint]) => (
      `<div class="metric" title="${hint}"><span>${name}</span><b>${fmt(value)}</b></div>`
    ))
    .join('');

  card.querySelector('.metrics').innerHTML = metricsHtml;

  const box = testMetrics.confusion;
  card.querySelector('[data-cell="tp"]').textContent = `TP ${box.tp}`;
  card.querySelector('[data-cell="tn"]').textContent = `TN ${box.tn}`;
  card.querySelector('[data-cell="fp"]').textContent = `FP ${box.fp}`;
  card.querySelector('[data-cell="fn"]').textContent = `FN ${box.fn}`;
}

function showMessage(text) {
  ui.msg.textContent = text;
  ui.msg.hidden = false;
}

function hideMessage() {
  ui.msg.textContent = '';
  ui.msg.hidden = true;
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

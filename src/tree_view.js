function setupTreeView(ui) {
  const ns = 'http://www.w3.org/2000/svg';
  let models = {};
  let nodes = [];
  let group = null;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let pointerX = 0;
  let pointerY = 0;
  let activeNode = null;
  let activeOverlay = null;
  let leafCount = 0;
  let pressNode = null;
  let moved = false;
  const expanded = new Set();
  const closed = new Set();

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-label', 'Схема выбранного дерева');
  ui.treeViewport.appendChild(svg);

  function clearHighlight() {
    if (activeOverlay) {
      activeOverlay.getContext('2d').clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
    activeNode = null;
    activeOverlay = null;
  }

  function showHighlight(record) {
    if (activeNode === record) return;
    clearHighlight();
    if (!record) return;

    const card = ui.results.querySelector(`[data-model="${ui.treeModel.value}"]`);
    if (!card) return;
    const canvas = card.querySelector('.prediction-overlay');
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);

    for (let y = 0; y < CANVAS_SIZE; y += 1) {
      for (let x = 0; x < CANVAS_SIZE; x += 1) {
        const px = x / (CANVAS_SIZE - 1);
        const py = y / (CANVAS_SIZE - 1);
        if (!reachesNode(record, px, py)) continue;

        const left = record.node.leaf || splitValue(record.node, px, py) < record.node.threshold;
        const i = (y * CANVAS_SIZE + x) * 4;
        image.data[i] = left ? 225 : 255;
        image.data[i + 1] = left ? 29 : 102;
        image.data[i + 2] = left ? 55 : 125;
        image.data[i + 3] = left ? 205 : 165;
      }
    }

    ctx.putImageData(image, 0, 0);
    activeNode = record;
    activeOverlay = canvas;
  }

  function reachesNode(record, x, y) {
    while (record.parent) {
      const parent = record.parent.node;
      if ((splitValue(parent, x, y) < parent.threshold) !== (record.side === 'left')) return false;
      record = record.parent;
    }
    return true;
  }

  function splitValue(node, x, y) {
    return node.oblique ? node.a * x + node.b * y : (node.feature === 0 ? x : y);
  }

  function makeLayout(node, parent = null, side = null, depth = 0) {
    const collapsed = !node.leaf && (closed.has(node) || (depth >= 3 && !expanded.has(node)));
    const record = { node, parent, side, collapsed, x: 0, y: 36 + depth * 64 };
    nodes.push(record);
    if (node.leaf || collapsed) {
      record.x = 32 + leafCount * 52;
      leafCount++;
    } else {
      const left = makeLayout(node.left, record, 'left', depth + 1);
      const right = makeLayout(node.right, record, 'right', depth + 1);
      record.x = (left.x + right.x) / 2;
    }
    return record;
  }

  function addSvg(name, attrs, parent) {
    const item = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
    parent.appendChild(item);
    return item;
  }

  function updateTransform() {
    if (group) group.setAttribute('transform', `translate(${offsetX} ${offsetY}) scale(${scale})`);
  }

  function fitTree() {
    if (!nodes.length) return;
    const width = nodes[nodes.length - 1].x + 32;
    const height = Math.max(...nodes.map((item) => item.y)) + 36;
    scale = Math.min(1.25, (ui.treeViewport.clientWidth - 32) / width, (ui.treeViewport.clientHeight - 32) / height);
    offsetX = (ui.treeViewport.clientWidth - width * scale) / 2;
    offsetY = (ui.treeViewport.clientHeight - height * scale) / 2;
    updateTransform();
  }

  function render() {
    clearHighlight();
    svg.replaceChildren();
    nodes = [];
    leafCount = 0;
    const model = models[ui.treeModel.value];
    if (!model) return;

    const isForest = Array.isArray(model.trees);
    const selectedTree = Number(ui.treeNumber.value) || 0;
    ui.treeNumber.hidden = !isForest;
    ui.treeNumber.replaceChildren();
    if (isForest) {
      for (let i = 0; i < model.trees.length; i++) {
        ui.treeNumber.add(new Option(`Дерево ${i + 1}`, i));
      }
      ui.treeNumber.value = String(Math.min(selectedTree, model.trees.length - 1));
    }
    const tree = isForest ? model.trees[Number(ui.treeNumber.value)] : model;
    if (!tree || !tree.root) return;
    makeLayout(tree.root);
    group = addSvg('g', {}, svg);

    for (const record of nodes) {
      if (!record.parent) continue;
      addSvg('path', {
        class: 'tree-link',
        d: `M ${record.parent.x} ${record.parent.y + 14} L ${record.x} ${record.y - 14}`,
      }, group);
      addSvg('text', { class: 'tree-branch', x: record.x, y: record.y - 22 }, group).textContent = record.side === 'left' ? '<' : '≥';
    }

    nodes.forEach((record, index) => {
      const node = record.node;
      const item = addSvg('g', {
        class: `tree-node${node.leaf ? ' leaf' : ''}${record.collapsed ? ' collapsed' : ''}`,
        transform: `translate(${record.x} ${record.y})`,
        'data-index': index,
      }, group);
      addSvg('circle', { r: 14 }, item);
      addSvg('text', { y: 1 }, item).textContent = node.leaf ? (node.probability >= 0.5 ? '1' : '0') : (node.oblique ? 'xy' : (node.feature === 0 ? 'x' : 'y'));
      if (record.collapsed) addSvg('text', { class: 'expand-mark', x: 15, y: 15 }, item).textContent = '+';
      const split = node.oblique ? `${node.a.toFixed(2)}x + ${node.b.toFixed(2)}y` : (node.feature === 0 ? 'x' : 'y');
      addSvg('title', {}, item).textContent = node.leaf
        ? `Лист: класс ${node.probability >= 0.5 ? 1 : 0}, доля рисунка ${node.probability.toFixed(2)}, точек ${node.total}`
        : `${split} < ${node.threshold.toFixed(2)}, точек ${node.total}; тёмный цвет: <, светлый: ≥; нажмите, чтобы ${record.collapsed ? 'раскрыть' : 'свернуть'} ветвь`;
    });

    fitTree();
  }

  ui.treeModel.addEventListener('change', () => {
    expanded.clear();
    closed.clear();
    ui.treeNumber.value = '0';
    render();
  });
  ui.treeNumber.addEventListener('change', () => {
    expanded.clear();
    closed.clear();
    render();
  });

  ui.treeViewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !nodes.length) return;
    dragging = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    moved = false;
    const item = event.target.closest('.tree-node');
    pressNode = item ? nodes[Number(item.dataset.index)] : null;
    ui.treeViewport.setPointerCapture(event.pointerId);
    clearHighlight();
  });

  ui.treeViewport.addEventListener('pointermove', (event) => {
    if (dragging) {
      if (Math.abs(event.clientX - pointerX) + Math.abs(event.clientY - pointerY) > 3) moved = true;
      offsetX += event.clientX - pointerX;
      offsetY += event.clientY - pointerY;
      pointerX = event.clientX;
      pointerY = event.clientY;
      updateTransform();
      return;
    }
    const item = event.target.closest('.tree-node');
    showHighlight(item ? nodes[Number(item.dataset.index)] : null);
  });

  ui.treeViewport.addEventListener('pointerup', () => {
    dragging = false;
    if (!moved && pressNode && !pressNode.node.leaf) {
      const node = pressNode.node;
      if (pressNode.collapsed) {
        expanded.add(node);
        closed.delete(node);
      } else {
        closed.add(node);
        expanded.delete(node);
      }
      render();
    }
    pressNode = null;
  });
  ui.treeViewport.addEventListener('pointercancel', () => { dragging = false; pressNode = null; });
  ui.treeViewport.addEventListener('pointerleave', clearHighlight);

  ui.treeViewport.addEventListener('wheel', (event) => {
    if (!nodes.length) return;
    event.preventDefault();
    const next = Math.max(0.001, Math.min(3, scale * Math.exp(-event.deltaY * 0.001)));
    const rect = ui.treeViewport.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    offsetX = x - (x - offsetX) * next / scale;
    offsetY = y - (y - offsetY) * next / scale;
    scale = next;
    updateTransform();
  }, { passive: false });

  return {
    setModels(next) {
      models = next;
      expanded.clear();
      closed.clear();
      ui.treeModel.disabled = false;
      render();
    },
    clear() {
      clearHighlight();
      models = {};
      nodes = [];
      expanded.clear();
      closed.clear();
      svg.replaceChildren();
      ui.treeModel.disabled = true;
      ui.treeNumber.hidden = true;
    },
  };
}

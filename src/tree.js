class DecisionTree {
  constructor(options) {
    this.maxDepth = options.maxDepth;
    this.minLeaf = options.minLeaf;
    this.oblique = options.oblique || false;
    this.directionCount = options.directionCount || 12;
    this.randomThresholds = options.randomThresholds || 20;
    this.directionsPerSplit = options.directionsPerSplit || null;
    this.root = null;
  }

  fit(rows) {
    this.root = this.build(rows, 0);
    return this;
  }

  predictScore(x, y) {
    let node = this.root;

    while (node && !node.leaf) {
      const value = node.oblique
        ? node.a * x + node.b * y
        : (node.feature === 0 ? x : y);
      node = value < node.threshold ? node.left : node.right;
    }

    return node ? node.probability : 0;
  }

  build(rows, depth) {
    const total = rows.length;
    const positives = countPositive(rows);
    const node = {
      leaf: true,
      total,
      positives,
      probability: positives / (total || 1),
    };

    const isPure = positives === 0 || positives === total;
    if (depth >= this.maxDepth || total < this.minLeaf * 2 || isPure) {
      return node;
    }

    const split = this.bestSplit(rows);
    if (!split || split.gain <= 0.0001) {
      return node;
    }

    const left = [];
    const right = [];

    for (const row of rows) {
      const value = split.oblique
        ? split.a * row.x + split.b * row.y
        : (split.feature === 0 ? row.x : row.y);

      if (value < split.threshold) {
        left.push(row);
      } else {
        right.push(row);
      }
    }

    if (left.length < this.minLeaf || right.length < this.minLeaf) {
      return node;
    }

    node.leaf = false;
    node.oblique = split.oblique;
    node.feature = split.feature;
    node.a = split.a;
    node.b = split.b;
    node.threshold = split.threshold;
    node.left = this.build(left, depth + 1);
    node.right = this.build(right, depth + 1);
    return node;
  }

  bestSplit(rows) {
    const allDirections = this.oblique
      ? this.makeDirections()
      : [{ feature: 0 }, { feature: 1 }];
    const directions = pickDirections(allDirections, this.directionsPerSplit);
    const totalPositives = countPositive(rows);
    const parentGini = gini(totalPositives, rows.length);
    let best = null;

    for (const direction of directions) {
      const values = rows
        .map((row) => ({
          value: projectRow(row, direction),
          label: row.label,
        }))
        .sort((a, b) => a.value - b.value);

      let pointer = 0;
      let leftTotal = 0;
      let leftPositives = 0;

      for (const threshold of makeThresholds(values, this.randomThresholds)) {
        while (pointer < values.length && values[pointer].value < threshold) {
          leftTotal += 1;
          if (values[pointer].label === 1) {
            leftPositives += 1;
          }
          pointer += 1;
        }

        const rightTotal = rows.length - leftTotal;
        const rightPositives = totalPositives - leftPositives;

        if (leftTotal < this.minLeaf || rightTotal < this.minLeaf) {
          continue;
        }

        const impurity = (leftTotal / rows.length) * gini(leftPositives, leftTotal)
          + (rightTotal / rows.length) * gini(rightPositives, rightTotal);
        const gain = parentGini - impurity;

        if (!best || gain > best.gain) {
          best = {
            ...direction,
            threshold,
            gain,
            oblique: direction.feature === undefined,
          };
        }
      }
    }

    return best;
  }

  makeDirections() {
    const base = [
      { a: 1, b: 0 },
      { a: 0, b: 1 },
      { a: Math.SQRT1_2, b: Math.SQRT1_2 },
      { a: Math.SQRT1_2, b: -Math.SQRT1_2 },
    ];
    const directions = base.slice(0, Math.min(base.length, this.directionCount));

    for (let i = directions.length; i < this.directionCount; i += 1) {
      const angle = Math.random() * Math.PI;
      directions.push({ a: Math.cos(angle), b: Math.sin(angle) });
    }

    return directions;
  }
}

class RandomForest {
  constructor(options) {
    this.treeCount = options.treeCount;
    this.bootstrapRatio = options.bootstrapRatio;
    this.treeOptions = options.treeOptions;
    this.trees = [];
  }

  fit(rows) {
    const sampleSize = Math.max(1, Math.floor(rows.length * this.bootstrapRatio));
    this.trees = [];

    for (let i = 0; i < this.treeCount; i += 1) {
      const sample = [];
      for (let j = 0; j < sampleSize; j += 1) {
        sample.push(rows[Math.floor(Math.random() * rows.length)]);
      }
      this.trees.push(new DecisionTree(this.treeOptions).fit(sample));
    }

    return this;
  }

  predictScore(x, y) {
    if (!this.trees.length) {
      return 0;
    }

    let sum = 0;
    for (const tree of this.trees) {
      sum += tree.predictScore(x, y);
    }

    return sum / this.trees.length;
  }
}

function projectRow(row, direction) {
  if (direction.feature === 0) {
    return row.x;
  }
  if (direction.feature === 1) {
    return row.y;
  }
  return direction.a * row.x + direction.b * row.y;
}

function countPositive(rows) {
  let count = 0;
  for (const row of rows) {
    count += row.label;
  }
  return count;
}

function gini(positives, total) {
  if (!total) {
    return 0;
  }
  const ratio = positives / total;
  return 1 - ratio * ratio - (1 - ratio) * (1 - ratio);
}

function makeThresholds(values, limit) {
  const unique = [];
  let last = null;

  for (const item of values) {
    if (last === null || item.value !== last) {
      unique.push(item.value);
      last = item.value;
    }
  }

  if (unique.length < 2) {
    return [];
  }

  const result = [];
  const steps = Math.min(limit, unique.length - 1);

  for (let i = 1; i <= steps; i += 1) {
    const index = Math.floor((i * unique.length) / (steps + 1));
    result.push((unique[index - 1] + unique[index]) / 2);
  }

  return result;
}

function pickDirections(directions, limit) {
  if (!limit || limit >= directions.length) {
    return directions;
  }

  const copy = directions.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, limit);
}

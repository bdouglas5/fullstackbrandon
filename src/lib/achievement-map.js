import { ACHIEVEMENTS, BRANCHES } from "../../shared/achievements.js";

// Arrange each prerequisite family as a downward tree. Multi-parent trophies
// sit below the families they join; these links are the real engine prerequisites.
export function createAchievementMap() {
  const nodes = [],
    edges = [],
    branches = {};
  let offset = 100;
  for (const [branch, title] of BRANCHES) {
    const items = ACHIEVEMENTS.filter((a) => a.branch === branch);
    const byId = Object.fromEntries(items.map((a) => [a.id, a]));
    const children = Object.fromEntries(items.map((a) => [a.id, []]));
    const roots = [],
      joins = [];
    for (const a of items) {
      const parents = a.requires.filter((id) => byId[id]);
      if (parents.length > 1) joins.push(a);
      else if (parents.length) children[parents[0]].push(a.id);
      else roots.push(a.id);
    }
    const widths = {};
    const width = (id) =>
      (widths[id] ??= Math.max(
        144,
        children[id].reduce((sum, child) => sum + width(child), 0),
      ));
    const branchWidth = roots.reduce((sum, id) => sum + width(id) + 28, 0);
    const positions = {};
    const place = (id, left, depth) => {
      const x = left + width(id) / 2;
      const y = 190 + depth * 110;
      positions[id] = { x, y };
      nodes.push({ ...byId[id], x, y });
      let childLeft = left;
      for (const child of children[id]) {
        place(child, childLeft, depth + 1);
        childLeft += width(child);
      }
    };
    let left = offset;
    for (const id of roots) {
      place(id, left, 0);
      left += width(id) + 28;
    }
    for (const a of joins) {
      const parents = a.requires.filter((id) => positions[id]);
      const x =
        parents.reduce((sum, id) => sum + positions[id].x, 0) / parents.length;
      const y = Math.max(...parents.map((id) => positions[id].y)) + 110;
      positions[a.id] = { x, y };
      nodes.push({ ...a, x, y });
    }
    const hub = {
      id: `branch-${branch}`,
      branch,
      title,
      x: offset + (branchWidth - 28) / 2,
      y: 100,
      hub: true,
    };
    branches[branch] = hub;
    nodes.push(hub);
    for (const a of items) {
      const parents = a.requires.filter((id) => positions[id]);
      for (const id of parents.length ? parents : [hub.id])
        edges.push({ from: id, to: a.id });
    }
    offset += branchWidth + 150;
  }
  // Pack branches in two columns so the overview uses height as well as width.
  const groups = BRANCHES.map(([id]) => {
    const family = nodes.filter((n) => n.branch === id);
    const left = Math.min(...family.map((n) => n.x)) - 80;
    const right = Math.max(...family.map((n) => n.x)) + 80;
    return {
      family,
      left,
      width: right - left,
      height: Math.max(...family.map((n) => n.y)) - 100 + 120,
    };
  });
  const columns = [0, 1].map((column) =>
    Math.max(...groups.filter((_, i) => i % 2 === column).map((g) => g.width)),
  );
  let rowTop = 140;
  for (let i = 0; i < groups.length; i += 2) {
    for (let column = 0; column < 2 && groups[i + column]; column++) {
      const group = groups[i + column];
      const left = 100 + (column ? columns[0] + 160 : 0);
      for (const node of group.family) {
        node.x += left - group.left;
        node.y += rowTop - 100;
      }
    }
    rowTop += Math.max(groups[i].height, groups[i + 1]?.height || 0) + 100;
  }
  offset = 200 + columns[0] + columns[1] + 160;
  const origin = {
    id: "journey",
    title: "Brandon’s journey",
    branch: "service",
    x: branches.service.x,
    y: 20,
    hub: true,
  };
  nodes.push(origin);
  for (const hub of Object.values(branches))
    edges.push({ from: origin.id, to: hub.id });
  return {
    nodes,
    edges,
    branches,
    byId: Object.fromEntries(nodes.map((n) => [n.id, n])),
    width: offset,
    height: Math.max(...nodes.map((n) => n.y)) + 150,
  };
}
